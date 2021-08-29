//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IPriceOracle.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

contract UniswapV2PriceOracle is IPriceOracle {

    using SafeMath for uint256;

    using FixedPoint for *;

    struct PriceObservation {
        uint32 timestamp;
        uint256 price0Cumulative;
        uint256 price1Cumulative;
    }

    address immutable uniswapFactory;

    address immutable quoteToken;

    uint256 immutable period;

    mapping (address => AccumulationLibrary.PriceAccumulator) accumulations;
    mapping(address => ObservationLibrary.PriceObservation) observations;

    constructor(address uniswapFactory_, address quoteToken_, uint256 period_) {
        uniswapFactory = uniswapFactory_;
        quoteToken = quoteToken_;
        period = period_;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        uint256 deltaTime = block.timestamp.sub(observations[token].timestamp);

        return deltaTime >= period;
    }

    function update(address token) override virtual external {
        if (needsUpdate(token)) {
            address pairAddress = IUniswapV2Factory(uniswapFactory).getPair(token, quoteToken);

            AccumulationLibrary.PriceAccumulator storage accumulation = accumulations[token];

            // Get current accumulations from Uniswap's price accumulator
            (uint256 cumulativeQuoteTokenPrice, uint256 cumulativeTokenPrice, uint32 blockTimestamp) =
                UniswapV2OracleLibrary.currentCumulativePrices(pairAddress);

            if (token < quoteToken) {
                // Rearrange the values so that token0 in the underlying is always 'token'
                uint256 temp = cumulativeTokenPrice;
                cumulativeTokenPrice = cumulativeQuoteTokenPrice;
                cumulativeQuoteTokenPrice = temp;
            }

            if (accumulation.timestamp == 0) {
                // No prior observation so we use the last observation data provided by the pair

                IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

                // This is the timestamp when price0CumulativeLast and price1CumulativeLast was set
                (,, uint32 timestamp) = pair.getReserves();
                
                require(timestamp != 0, "UniswapV2PriceOracle: MISSING_RESERVES_TIMESTAMP");

                if (token < quoteToken) {
                    accumulation.cumulativeTokenPrice = pair.price0CumulativeLast();
                    accumulation.cumulativeQuoteTokenPrice = pair.price1CumulativeLast();
                } else {
                    accumulation.cumulativeTokenPrice = pair.price1CumulativeLast();
                    accumulation.cumulativeQuoteTokenPrice = pair.price0CumulativeLast();
                }

                accumulation.timestamp = timestamp;
            }

            uint32 timeElapsed = blockTimestamp - uint32(accumulation.timestamp); // overflow is desired
            if (timeElapsed != 0) {
                ObservationLibrary.PriceObservation storage observation = observations[token];

                // Store price and current time
                observation.price = computeAmountOut(accumulation.cumulativeTokenPrice, cumulativeTokenPrice, timeElapsed, computeWholeUnitAmount(token));
                observation.timestamp = block.timestamp;

                // Store current accumulations and the timestamp of them
                accumulation.cumulativeTokenPrice = cumulativeTokenPrice;
                accumulation.cumulativeQuoteTokenPrice = cumulativeQuoteTokenPrice;
                accumulation.timestamp = blockTimestamp;
            } else {
                // We take the last price as the current price as the price seems to not have moved at all
                // We update the timestamp so that the oracle doesn't update again for another period
                observations[token].timestamp = block.timestamp;
            }
        }
    }

    function consultPrice(address token) override virtual external view returns (uint256 price) {
        require(observations[token].timestamp != 0, "UniswapV2PriceOracle: MISSING_OBSERVATION");

        return observations[token].price;
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
