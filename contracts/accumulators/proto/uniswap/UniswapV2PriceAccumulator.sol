//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../../PriceAccumulator.sol";

import "../../../libraries/uniswap-lib/FixedPoint.sol";
import "../../../libraries/uniswap-v2-periphery/UniswapV2OracleLibrary.sol";
import "../../../libraries/SafeCastExt.sol";

contract UniswapV2PriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;
    using FixedPoint for *;

    address public immutable uniswapFactory;

    bytes32 public immutable initCodeHash;

    mapping(address => AccumulationLibrary.UniswapV2PriceAccumulator) public uniPriceAccumulations;
    mapping(address => uint112) public uniPrices;

    constructor(
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        uniswapFactory = uniswapFactory_;
        initCodeHash = initCodeHash_;
    }

    function canUpdate(address token) public view virtual override returns (bool) {
        address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

        if (!pairAddress.isContract()) {
            // Pool doesn't exist
            return false;
        }

        (, , uint256 timestamp) = IUniswapV2Pair(pairAddress).getReserves();
        if (timestamp == 0) {
            // Pool doesn't have liquidity
            return false;
        }

        return super.canUpdate(token);
    }

    function _update(address token) internal virtual override returns (bool) {
        address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

        require(pairAddress.isContract(), "UniswapV2PriceAccumulator: POOL_NOT_FOUND");

        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

        // This is the timestamp when price0CumulativeLast and price1CumulativeLast was set
        (, , uint32 timestamp) = pair.getReserves();

        require(timestamp != 0, "UniswapV2PriceAccumulator: MISSING_RESERVES_TIMESTAMP");

        AccumulationLibrary.UniswapV2PriceAccumulator storage priceAccumulation = uniPriceAccumulations[token];

        uint256 cumulativeTokenPrice;
        uint32 blockTimestamp;

        {
            uint256 cumulativeQuoteTokenPrice;

            // Get current accumulations from Uniswap's price accumulator
            (cumulativeQuoteTokenPrice, cumulativeTokenPrice, blockTimestamp) = UniswapV2OracleLibrary
                .currentCumulativePrices(pairAddress);

            if (token < quoteToken) {
                // Rearrange the values so that token0 in the underlying is always 'token'
                cumulativeTokenPrice = cumulativeQuoteTokenPrice;
            }
        }

        if (priceAccumulation.timestamp == 0) {
            // No prior observation so we use the last observation data provided by the pair

            if (token < quoteToken) priceAccumulation.cumulativePrice = pair.price0CumulativeLast();
            else priceAccumulation.cumulativePrice = pair.price1CumulativeLast();

            priceAccumulation.timestamp = timestamp;
        }

        uint32 timeElapsed;
        unchecked {
            // Subtraction underflow is desired
            timeElapsed = blockTimestamp - uint32(priceAccumulation.timestamp);
        }
        if (timeElapsed != 0) {
            uniPrices[token] = computeAmountOut(
                priceAccumulation.cumulativePrice,
                cumulativeTokenPrice,
                timeElapsed,
                computeWholeUnitAmount(token)
            ).toUint112();

            // Store current accumulations and the timestamp of them
            priceAccumulation.cumulativePrice = cumulativeTokenPrice;
            priceAccumulation.timestamp = blockTimestamp;
        }

        return super._update(token);
    }

    function fetchPrice(address token) internal view virtual override returns (uint112 price) {
        uint256 cumulativeTokenPrice;
        uint32 blockTimestamp;

        uint256 lastCumulativePrice;
        uint256 lastTimestamp;
        {
            address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

            require(pairAddress.isContract(), "UniswapV2PriceAccumulator: POOL_NOT_FOUND");

            IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

            // This is the timestamp when price0CumulativeLast and price1CumulativeLast was set
            (, , uint32 timestamp) = pair.getReserves();

            require(timestamp != 0, "UniswapV2PriceAccumulator: MISSING_RESERVES_TIMESTAMP");

            AccumulationLibrary.UniswapV2PriceAccumulator storage priceAccumulation = uniPriceAccumulations[token];

            {
                uint256 cumulativeQuoteTokenPrice;

                // Get current accumulations from Uniswap's price accumulator
                (cumulativeQuoteTokenPrice, cumulativeTokenPrice, blockTimestamp) = UniswapV2OracleLibrary
                    .currentCumulativePrices(pairAddress);

                if (token < quoteToken) {
                    // Rearrange the values so that token0 in the underlying is always 'token'
                    cumulativeTokenPrice = cumulativeQuoteTokenPrice;
                }
            }

            lastCumulativePrice = priceAccumulation.cumulativePrice;
            lastTimestamp = priceAccumulation.timestamp;

            if (lastTimestamp == 0) {
                // No prior observation so we use the last observation data provided by the pair

                if (token < quoteToken) lastCumulativePrice = pair.price0CumulativeLast();
                else lastCumulativePrice = pair.price1CumulativeLast();

                lastTimestamp = timestamp;
            }
        }

        uint32 timeElapsed;
        unchecked {
            // Subtraction underflow is desired
            timeElapsed = blockTimestamp - uint32(lastTimestamp);
        }
        if (timeElapsed != 0) {
            price = computeAmountOut(
                lastCumulativePrice,
                cumulativeTokenPrice,
                timeElapsed,
                computeWholeUnitAmount(token)
            ).toUint112();
        }

        // Fallback to last stored price
        return uniPrices[token];
    }

    function computeWholeUnitAmount(address token) internal view returns (uint256 amount) {
        amount = uint256(10)**IERC20Metadata(token).decimals();
    }

    // given the cumulative prices of the start and end of a period, and the length of the period, compute the average
    // price in terms of how much amount out is received for the amount in
    function computeAmountOut(
        uint256 priceCumulativeStart,
        uint256 priceCumulativeEnd,
        uint256 timeElapsed,
        uint256 amountIn
    ) internal pure returns (uint256 amountOut) {
        // overflow is desired.
        unchecked {
            FixedPoint.uq112x112 memory priceAverage = FixedPoint.uq112x112(
                uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed)
            );
            amountOut = priceAverage.mul(amountIn).decode144();
        }
    }

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2PriceAccumulator: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2PriceAccumulator: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        bytes32 initCodeHash_,
        address tokenA,
        address tokenB
    ) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(hex"ff", factory, keccak256(abi.encodePacked(token0, token1)), initCodeHash_)
                    )
                )
            )
        );
    }
}
