//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "../../PeriodicOracle.sol";
import "../../../interfaces/ILiquidityAccumulator.sol";

import "../../../libraries/AccumulationLibrary.sol";
import "../../../libraries/ObservationLibrary.sol";

import "../../../libraries/uniswap-lib/FixedPoint.sol";
import "../../../libraries/uniswap-v2-periphery/UniswapV2OracleLibrary.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "hardhat/console.sol";

contract UniswapV2Oracle is PeriodicOracle {
    using FixedPoint for *;

    address public immutable liquidityAccumulator;

    address public immutable uniswapFactory;

    bytes32 public immutable initCodeHash;

    mapping(address => AccumulationLibrary.PriceAccumulator) public priceAccumulations;
    mapping(address => AccumulationLibrary.LiquidityAccumulator) public liquidityAccumulations;

    constructor(
        address liquidityAccumulator_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 period_
    ) PeriodicOracle(quoteToken_, period_) {
        liquidityAccumulator = liquidityAccumulator_;
        uniswapFactory = uniswapFactory_;
        initCodeHash = initCodeHash_;
    }

    function _update(address token) internal virtual override returns (bool) {
        address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

        require(isContract(pairAddress), "UniswapV2Oracle: POOL_NOT_FOUND");

        ObservationLibrary.Observation storage observation = observations[token];

        /*
         * 1. Update price
         */
        {
            IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

            // This is the timestamp when price0CumulativeLast and price1CumulativeLast was set
            (, , uint32 timestamp) = pair.getReserves();

            require(timestamp != 0, "UniswapV2Oracle: MISSING_RESERVES_TIMESTAMP");

            AccumulationLibrary.PriceAccumulator storage priceAccumulation = priceAccumulations[token];

            // Get current accumulations from Uniswap's price accumulator
            (
                uint256 cumulativeQuoteTokenPrice,
                uint256 cumulativeTokenPrice,
                uint32 blockTimestamp
            ) = UniswapV2OracleLibrary.currentCumulativePrices(pairAddress);

            if (token < quoteToken) {
                // Rearrange the values so that token0 in the underlying is always 'token'
                cumulativeTokenPrice = cumulativeQuoteTokenPrice;
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
                // Store price and current time
                observation.price = computeAmountOut(
                    priceAccumulation.cumulativePrice,
                    cumulativeTokenPrice,
                    timeElapsed,
                    computeWholeUnitAmount(token)
                );

                // Store current accumulations and the timestamp of them
                priceAccumulation.cumulativePrice = cumulativeTokenPrice;
                priceAccumulation.timestamp = blockTimestamp;
            }
        }

        /*
         * 2. Update liquidity
         */
        {
            // Note: We assume the accumulator is up-to-date (gas savings)
            AccumulationLibrary.LiquidityAccumulator memory freshAccumulation = ILiquidityAccumulator(
                liquidityAccumulator
            ).getCurrentAccumulation(token);

            AccumulationLibrary.LiquidityAccumulator storage lastAccumulation = liquidityAccumulations[token];

            uint256 lastAccumulationTime = lastAccumulation.timestamp;

            if (freshAccumulation.timestamp > lastAccumulationTime) {
                // Accumulator updated, so we update our observation

                if (lastAccumulationTime != 0) {
                    // We have two accumulations -> calculate liquidity from them
                    (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(
                        liquidityAccumulator
                    ).calculateLiquidity(lastAccumulation, freshAccumulation);
                }

                lastAccumulation.cumulativeTokenLiquidity = freshAccumulation.cumulativeTokenLiquidity;
                lastAccumulation.cumulativeQuoteTokenLiquidity = freshAccumulation.cumulativeQuoteTokenLiquidity;
                lastAccumulation.timestamp = freshAccumulation.timestamp;
            }
        }

        // Update observation timestamp so that the oracle doesn't update again until the next period
        observation.timestamp = block.timestamp;

        emit Updated(
            token,
            quoteToken,
            block.timestamp,
            observation.price,
            observation.tokenLiquidity,
            observation.quoteTokenLiquidity
        );

        return true;
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
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2Library: ZERO_ADDRESS");
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

    function isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
