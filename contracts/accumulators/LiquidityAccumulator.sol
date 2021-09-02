//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/ILiquidityAccumulator.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract LiquidityAccumulator is ILiquidityAccumulator {
    uint256 public constant CHANGE_PRECISION = 10**8;

    uint256 public immutable updateThreshold;
    uint256 public immutable minUpdateDelay;
    uint256 public immutable maxUpdateDelay;

    address public immutable override quoteToken;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) accumulations;
    mapping(address => ObservationLibrary.LiquidityObservation) observations;

    constructor(
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) {
        quoteToken = quoteToken_;
        updateThreshold = updateTheshold_;
        minUpdateDelay = minUpdateDelay_;
        maxUpdateDelay = maxUpdateDelay_;
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];

        uint256 deltaTime = block.timestamp - lastObservation.timestamp;
        if (deltaTime < minUpdateDelay) return false;
        // Ensures updates occur at most once every minUpdateDelay (seconds)
        else if (deltaTime >= maxUpdateDelay) return true; // Ensures updates occur (optimistically) at least once every maxUpdateDelay (seconds)

        /*
         * maxUpdateDelay > deltaTime >= minUpdateDelay
         *
         * Check if the % change in liquidity warrents an update (saves gas vs. always updating on change)
         */

        (uint256 tokenLiquidity, uint256 quoteTokenLiquidity) = fetchLiquidity(token);

        return
            changeThresholdSurpassed(tokenLiquidity, lastObservation.tokenLiquidity, updateThreshold) ||
            changeThresholdSurpassed(quoteTokenLiquidity, lastObservation.quoteTokenLiquidity, updateThreshold);
    }

    function update(address token) external virtual override returns (bool) {
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

                return true;
            }

            /*
             * Update
             */

            uint256 deltaTime = block.timestamp - accumulation.timestamp;

            if (deltaTime != 0) {
                unchecked {
                    // Overflow is desired and results in correct functionality
                    accumulation.cumulativeTokenLiquidity += tokenLiquidity * deltaTime;
                    accumulation.cumulativeQuoteTokenLiquidity += quoteTokenLiquidity * deltaTime;
                    accumulation.timestamp = block.timestamp;

                    observation.tokenLiquidity = tokenLiquidity;
                    observation.quoteTokenLiquidity = quoteTokenLiquidity;
                    observation.timestamp = block.timestamp;
                }

                return true;
            }
        }

        return false;
    }

    function getAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.LiquidityAccumulator memory)
    {
        return accumulations[token];
    }

    function getLastObservation(address token)
        public
        view
        virtual
        override
        returns (ObservationLibrary.LiquidityObservation memory)
    {
        return observations[token];
    }

    function calculateLiquidity(
        AccumulationLibrary.LiquidityAccumulator memory firstAccumulation,
        AccumulationLibrary.LiquidityAccumulator memory secondAccumulation
    ) public pure virtual override returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity) {
        uint256 deltaTime = secondAccumulation.timestamp - firstAccumulation.timestamp;
        require(deltaTime != 0, "LiquidityAccumulator: delta time cannot be 0.");

        unchecked {
            // Underflow is desired and results in correct functionality
            tokenLiquidity =
                (secondAccumulation.cumulativeTokenLiquidity - firstAccumulation.cumulativeTokenLiquidity) /
                deltaTime;
            quoteTokenLiquidity =
                (secondAccumulation.cumulativeQuoteTokenLiquidity - firstAccumulation.cumulativeQuoteTokenLiquidity) /
                deltaTime;
        }
    }

    function changeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateTheshold
    ) internal pure returns (bool) {
        // Ensure a is never smaller than b
        if (a < b) {
            uint256 temp = a;
            a = b;
            b = temp;
        }

        // a >= b

        if (a == 0) {
            // a == b == 0 (since a >= b), therefore no change
            return false;
        }

        unchecked {
            uint256 delta = a - b; // a >= b, therefore no underflow
            uint256 preciseDelta = delta * CHANGE_PRECISION;

            // If the delta is so large that multiplying by CHANGE_PRECISION overflows, we assume that
            // the change threshold has been surpassed.
            // If our assumption is incorrect, the accumulator will be extra-up-to-date, which won't
            // really break anything, but will cost more gas in keeping this accumulator updated.
            if (preciseDelta < delta) return true;

            uint256 change = preciseDelta / b;

            return change >= updateTheshold;
        }
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity);
}
