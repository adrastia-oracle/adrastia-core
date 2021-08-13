//SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

import "../interfaces/IDataSource.sol";

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";

import "@uniswap/v2-periphery/contracts/libraries/SafeMath.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";

contract UniswapV2DataSource is IDataSource {
    using FixedPoint for *;

    struct PriceObservation {
        uint32 timestamp;
        uint256 price0Cumulative;
        uint256 price1Cumulative;
    }

    address immutable public uniswapFactory;

    address immutable private _baseToken;

    mapping (address => PriceObservation) lastObservations;

    constructor(address uniswapFactory_, address baseToken_) public {
        uniswapFactory = uniswapFactory_;
        _baseToken = baseToken_;
    }

    function baseToken() override virtual public view returns (address) {
        return _baseToken;
    }

    function fetchPriceAndLiquidity(address token) override virtual public returns(bool success, uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity) {
        address pairAddress = IUniswapV2Factory(uniswapFactory).getPair(token, baseToken());
        if (pairAddress == address(0))
            return (false, 0, 0, 0);

        PriceObservation storage lastObservation = lastObservations[token];

        (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp) =
            UniswapV2OracleLibrary.currentCumulativePrices(pairAddress);

        if (lastObservation.timestamp == 0) {
            // No prior observation so we use the last observation data provided by the pair

            IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

            (uint256 reserve0, uint256 reserve1, uint32 timestamp) = pair.getReserves();
            if (timestamp == 0)
                return (false, 0, 0, 0); // No prior information from the pair, return failure

            if (pair.token0() == token) {
                tokenLiquidity = reserve0;
                baseLiquidity = reserve1;
            } else {
                tokenLiquidity = reserve1;
                baseLiquidity = reserve0;
            }

            lastObservation.timestamp = timestamp;
            lastObservation.price0Cumulative = pair.price0CumulativeLast();
            lastObservation.price1Cumulative = pair.price1CumulativeLast();
        } else {
            IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

            (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

            if (pair.token0() == token) {
                tokenLiquidity = reserve0;
                baseLiquidity = reserve1;
            } else {
                tokenLiquidity = reserve1;
                baseLiquidity = reserve0;
            }
        }

        uint32 timeElapsed = blockTimestamp - lastObservation.timestamp; // overflow is desired
        if (timeElapsed == 0)
            return (false, 0, 0, 0); // No time has passed since last observation so we cannot calculate price

        /*
         * At this point, we can calculate all needed information
         */

        if (IUniswapV2Pair(pairAddress).token0() == token)
            price = computeAmountOut(lastObservation.price0Cumulative, price0Cumulative, timeElapsed, computeWholeUnitAmount(token));
        else
            price = computeAmountOut(lastObservation.price1Cumulative, price1Cumulative, timeElapsed, computeWholeUnitAmount(token));
        
        success = true;

        /*
         * Store current observation
         */

         lastObservation.timestamp = blockTimestamp;
         lastObservation.price0Cumulative = price0Cumulative;
         lastObservation.price1Cumulative = price1Cumulative;
    }

    function fetchPrice(address token) override virtual public returns(bool success, uint256 price) {
        (success, price,,) = fetchPriceAndLiquidity(token);
    }

    function fetchLiquidity(address token) override virtual public returns(bool success, uint256 tokenLiquidity, uint256 baseLiquidity) {
        (success,, tokenLiquidity, baseLiquidity) = fetchPriceAndLiquidity(token);
    }

    function computeWholeUnitAmount(address token) private view returns(uint256 amount) {
        amount = uint256(10) ** IERC20(token).decimals();
    }

    // given the cumulative prices of the start and end of a period, and the length of the period, compute the average
    // price in terms of how much amount out is received for the amount in
    function computeAmountOut(
        uint256 priceCumulativeStart, uint256 priceCumulativeEnd,
        uint256 timeElapsed, uint256 amountIn
    ) private pure returns (uint256 amountOut) {
        // overflow is desired.
        FixedPoint.uq112x112 memory priceAverage = FixedPoint.uq112x112(
            uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed)
        );
        amountOut = priceAverage.mul(amountIn).decode144();
    }

}