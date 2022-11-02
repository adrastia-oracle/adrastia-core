//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./LiquidityAccumulator.sol";

import "../libraries/SafeCastExt.sol";

abstract contract HarmonicLiquidityAccumulator is LiquidityAccumulator {
    using SafeCast for uint256;
    using SafeCastExt for uint256;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    /// @inheritdoc ILiquidityAccumulator
    function calculateLiquidity(
        AccumulationLibrary.LiquidityAccumulator calldata firstAccumulation,
        AccumulationLibrary.LiquidityAccumulator calldata secondAccumulation
    ) external pure virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        require(firstAccumulation.timestamp != 0, "LiquidityAccumulator: TIMESTAMP_CANNOT_BE_ZERO");

        uint32 deltaTime = secondAccumulation.timestamp - firstAccumulation.timestamp;
        require(deltaTime != 0, "LiquidityAccumulator: DELTA_TIME_CANNOT_BE_ZERO");

        unchecked {
            // Underflow is desired and results in correct functionality
            tokenLiquidity = (
                ((uint256(deltaTime) << 80) /
                    (secondAccumulation.cumulativeTokenLiquidity - firstAccumulation.cumulativeTokenLiquidity))
            ).toUint112();
            quoteTokenLiquidity = (
                ((uint256(deltaTime) << 80) /
                    (secondAccumulation.cumulativeQuoteTokenLiquidity -
                        firstAccumulation.cumulativeQuoteTokenLiquidity))
            ).toUint112();
        }
    }

    /// @inheritdoc ILiquidityAccumulator
    function getCurrentAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.LiquidityAccumulator memory accumulation)
    {
        ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];
        require(lastObservation.timestamp != 0, "LiquidityAccumulator: UNINITIALIZED");

        accumulation = accumulations[token]; // Load last accumulation

        // Shift deltaTime to the left by 88 bits to form a 112 bit number, allowing for precise division
        // A non-zero deltaTime will be at least 1e24, allowing for at least 15 decimal places of precision, assuming
        // 1e9 max liquidity
        uint256 deltaTime = (block.timestamp - lastObservation.timestamp) << 80;

        uint256 tokenLiquidity = lastObservation.tokenLiquidity;
        uint256 quoteTokenLiquidity = lastObservation.quoteTokenLiquidity;

        if (tokenLiquidity == 0) {
            // Prevent division by zero
            tokenLiquidity = 1;
        }
        if (quoteTokenLiquidity == 0) {
            // Prevent division by zero
            quoteTokenLiquidity = 1;
        }

        if (deltaTime != 0) {
            // The last observation liquidities have existed for some time, so we add that
            uint112 timeWeightedTokenLiquidity = (deltaTime / tokenLiquidity).toUint112();
            uint112 timeWeightedQuoteTokenLiquidity = (deltaTime / quoteTokenLiquidity).toUint112();
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the reciprocals of the liquidites multiplied by the time those liquidities were present
                accumulation.cumulativeTokenLiquidity += timeWeightedTokenLiquidity;
                accumulation.cumulativeQuoteTokenLiquidity += timeWeightedQuoteTokenLiquidity;
            }
            accumulation.timestamp = block.timestamp.toUint32();
        }
    }

    function performUpdate(bytes memory data) internal virtual override returns (bool) {
        address token = abi.decode(data, (address));

        (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) = fetchLiquidity(token);

        // If the observation fails validation, do not update anything
        if (!validateObservation(data, tokenLiquidity, quoteTokenLiquidity)) return false;

        ObservationLibrary.LiquidityObservation storage observation = observations[token];
        AccumulationLibrary.LiquidityAccumulator storage accumulation = accumulations[token];

        if (observation.timestamp == 0) {
            /*
             * Initialize
             */
            observation.tokenLiquidity = tokenLiquidity;
            observation.quoteTokenLiquidity = quoteTokenLiquidity;
            observation.timestamp = accumulation.timestamp = block.timestamp.toUint32();

            emit Updated(token, tokenLiquidity, quoteTokenLiquidity, block.timestamp);

            return true;
        }

        /*
         * Update
         */

        // Shift deltaTime to the left by 88 bits to form a 112 bit number, allowing for precise division
        // A non-zero deltaTime will be at least 1e24, allowing for at least 15 decimal places of precision, assuming
        // 1e9 max liquidity
        uint256 deltaTime = (block.timestamp - observation.timestamp) << 80;

        uint256 oTokenLiquidity = observation.tokenLiquidity;
        if (oTokenLiquidity == 0) {
            // Prevent division by zero
            oTokenLiquidity = 1;
        }
        uint256 oQuoteTokenLiquidity = observation.quoteTokenLiquidity;
        if (oQuoteTokenLiquidity == 0) {
            // Prevent division by zero
            oQuoteTokenLiquidity = 1;
        }

        if (deltaTime != 0) {
            uint112 timeWeightedTokenLiquidity = (deltaTime / oTokenLiquidity).toUint112();
            uint112 timeWeightedQuoteTokenLiquidity = (deltaTime / oQuoteTokenLiquidity).toUint112();
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the reciprocals of the liquidites multiplied by the time those liquidities were present
                accumulation.cumulativeTokenLiquidity += timeWeightedTokenLiquidity;
                accumulation.cumulativeQuoteTokenLiquidity += timeWeightedQuoteTokenLiquidity;
            }
            observation.tokenLiquidity = tokenLiquidity;
            observation.quoteTokenLiquidity = quoteTokenLiquidity;
            observation.timestamp = accumulation.timestamp = block.timestamp.toUint32();

            emit Updated(token, tokenLiquidity, quoteTokenLiquidity, block.timestamp);

            return true;
        }

        return false;
    }
}
