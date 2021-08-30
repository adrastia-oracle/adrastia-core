//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IDataSource.sol";
import "../interfaces/ILiquidityAccumulator.sol";
import "../libraries/ObservationLibrary.sol";

import "@uniswap-mirror/v3-core/contracts/libraries/FullMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

abstract contract LiquidityAccumulator is ILiquidityAccumulator {

    using SafeMath for uint256;

    uint256 constant public CHANGE_PRECISION = 10**8;

    uint256 immutable public updateThreshold;
    uint256 immutable public minUpdateDelay;
    uint256 immutable public maxUpdateDelay;

    address immutable public override quoteToken;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) accumulations;
    mapping(address => ObservationLibrary.LiquidityObservation) observations;

    constructor(address quoteToken_, uint256 updateTheshold_, uint256 minUpdateDelay_, uint256 maxUpdateDelay_) {
        quoteToken = quoteToken_;
        updateThreshold = updateTheshold_;
        minUpdateDelay = minUpdateDelay_;
        maxUpdateDelay = maxUpdateDelay_;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];

        uint256 deltaTime = block.timestamp.sub(lastObservation.timestamp);
        if (deltaTime < minUpdateDelay)
            return false; // Ensures updates occur at most once every minUpdateDelay (seconds)
        else if (deltaTime >= maxUpdateDelay)
            return true; // Ensures updates occur (optimistically) at least once every maxUpdateDelay (seconds)

        /*
         * maxUpdateDelay > deltaTime >= minUpdateDelay
         *
         * Check if the % change in liquidity warrents an update (saves gas vs. always updating on change)
         */

        (uint256 tokenLiquidity, uint256 quoteTokenLiquidity) = fetchLiquidity(token);

        uint256 tokenLiquidityChange = calculateChange(tokenLiquidity, lastObservation.tokenLiquidity);
        uint256 quoteTokenLiquidityChange = calculateChange(quoteTokenLiquidity, lastObservation.quoteTokenLiquidity);

        return tokenLiquidityChange >= updateThreshold || quoteTokenLiquidityChange >= updateThreshold;
    }

    function update(address token) override virtual external {
        if (needsUpdate(token)) {
            (uint256 tokenLiquidity, uint256 quoteTokenLiquidity) = fetchLiquidity(token);

            ObservationLibrary.LiquidityObservation storage observation = observations[token];
            AccumulationLibrary.LiquidityAccumulator storage accumulation = accumulations[token];

            if (observation.timestamp == 0) {
                /*
                 * Initialize
                 */
                accumulation.cumulativeTokenLiquidity = observation.tokenLiquidity = tokenLiquidity;
                accumulation.cumulativeQuoteTokenLiquidity = observation.quoteTokenLiquidity = quoteTokenLiquidity;
                accumulation.timestamp = observation.timestamp = block.timestamp;

                return;
            }

            /*
             * Update
             */

            uint256 deltaTime = block.timestamp.sub(accumulation.timestamp);

            if (deltaTime != 0) {
                // TODO: Handle overflows
                accumulation.cumulativeTokenLiquidity += tokenLiquidity * deltaTime;
                accumulation.cumulativeQuoteTokenLiquidity += quoteTokenLiquidity * deltaTime;
                accumulation.timestamp = block.timestamp;

                observation.tokenLiquidity = tokenLiquidity;
                observation.quoteTokenLiquidity = quoteTokenLiquidity;
                observation.timestamp = block.timestamp;
            }
        }
    }

    function getAccumulation(address token) override virtual public view
        returns(AccumulationLibrary.LiquidityAccumulator memory)
    {
        return accumulations[token];
    }

    function getLastObservation(address token) override virtual public view
        returns(ObservationLibrary.LiquidityObservation memory)
    {
        return observations[token];
    }

    function calculateLiquidity(AccumulationLibrary.LiquidityAccumulator memory firstAccumulation, AccumulationLibrary.LiquidityAccumulator memory secondAccumulation) override virtual public pure
        returns(uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        uint256 deltaTime = secondAccumulation.timestamp.sub(firstAccumulation.timestamp);
        require(deltaTime != 0, "LiquidityAccumulator: delta time cannot be 0.");

        tokenLiquidity = (secondAccumulation.cumulativeTokenLiquidity.sub(firstAccumulation.cumulativeTokenLiquidity)).div(deltaTime);
        quoteTokenLiquidity = (secondAccumulation.cumulativeQuoteTokenLiquidity.sub(firstAccumulation.cumulativeQuoteTokenLiquidity)).div(deltaTime);
    }

    function calculateChange(uint256 a, uint256 b) internal pure returns(uint256) {
        // Ensure a is never smaller than b
        if (a < b) {
            uint256 temp = a;
            a = b;
            b = temp;
        }

        uint256 delta = a - b; // Safe: a is never smaller than b

        return FullMath.mulDiv(delta, CHANGE_PRECISION, b);
    }

    function fetchLiquidity(address token) virtual internal view returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity);

}
