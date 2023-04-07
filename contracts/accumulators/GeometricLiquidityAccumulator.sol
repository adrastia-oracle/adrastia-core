//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@prb/math/contracts/PRBMathUD60x18.sol";

import "./LiquidityAccumulator.sol";

import "../libraries/SafeCastExt.sol";

abstract contract GeometricLiquidityAccumulator is LiquidityAccumulator {
    using PRBMathUD60x18 for uint256;
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
            tokenLiquidity = uint256(
                (secondAccumulation.cumulativeTokenLiquidity - firstAccumulation.cumulativeTokenLiquidity) / deltaTime
            ).exp().toUint().toUint112();

            quoteTokenLiquidity = uint256(
                (secondAccumulation.cumulativeQuoteTokenLiquidity - firstAccumulation.cumulativeQuoteTokenLiquidity) /
                    deltaTime
            ).exp().toUint().toUint112();
        }
    }

    /// @inheritdoc ILiquidityAccumulator
    function getCurrentAccumulation(
        address token
    ) public view virtual override returns (AccumulationLibrary.LiquidityAccumulator memory accumulation) {
        ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];
        require(lastObservation.timestamp != 0, "LiquidityAccumulator: UNINITIALIZED");

        accumulation = accumulations[token]; // Load last accumulation

        uint32 deltaTime = (block.timestamp - lastObservation.timestamp).toUint32();

        if (deltaTime != 0) {
            uint256 tokenLiquidity = lastObservation.tokenLiquidity;
            uint256 quoteTokenLiquidity = lastObservation.quoteTokenLiquidity;

            if (tokenLiquidity == 0) {
                // ln(0) = undefined, so we set the token liquidity to 1
                tokenLiquidity = 1;
            }

            if (quoteTokenLiquidity == 0) {
                // ln(0) = undefined, so we set the quote token liquidity to 1
                quoteTokenLiquidity = 1;
            }

            // The last observation liquidities have existed for some time, so we add that
            uint112 timeWeightedTokenLiquidity = (tokenLiquidity.fromUint().ln() * deltaTime).toUint112();
            uint112 timeWeightedQuoteTokenLiquidity = (quoteTokenLiquidity.fromUint().ln() * deltaTime).toUint112();
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the liquidites multiplied by the time those liquidities were present
                accumulation.cumulativeTokenLiquidity += timeWeightedTokenLiquidity;
                accumulation.cumulativeQuoteTokenLiquidity += timeWeightedQuoteTokenLiquidity;
            }
            accumulation.timestamp = block.timestamp.toUint32();
        }
    }

    function performUpdate(bytes memory data) internal virtual override returns (bool) {
        (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) = fetchLiquidity(data);
        address token = abi.decode(data, (address));

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

        uint32 deltaTime = (block.timestamp - observation.timestamp).toUint32();

        if (deltaTime != 0) {
            uint256 oTokenLiquidity = observation.tokenLiquidity;
            uint256 oQuoteTokenLiquidity = observation.quoteTokenLiquidity;

            if (oTokenLiquidity == 0) {
                // ln(0) = undefined, so we set the token liquidity to 1
                oTokenLiquidity = 1;
            }

            if (oQuoteTokenLiquidity == 0) {
                // ln(0) = undefined, so we set the quote token liquidity to 1
                oQuoteTokenLiquidity = 1;
            }

            uint112 timeWeightedTokenLiquidity = (oTokenLiquidity.fromUint().ln() * deltaTime).toUint112();
            uint112 timeWeightedQuoteTokenLiquidity = (oQuoteTokenLiquidity.fromUint().ln() * deltaTime).toUint112();
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the liquidites multiplied by the time those liquidities were present
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
