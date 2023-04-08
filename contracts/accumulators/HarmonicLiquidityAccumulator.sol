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

    /// @notice Calculates a time-weighted value.
    /// @param value The value to weight, greater than 0.
    /// @param time The time to weight the value by, in seconds, and greater than 0.
    /// @return The time-weighted value.
    function calculateTimeWeightedValue(uint256 value, uint256 time) internal pure virtual override returns (uint256) {
        if (value == 0) {
            // We cannot divide by 0, so we use 1 as a substitute
            value = 1;
        }

        // Shift time to the left by 80 bits to form a 112 bit number, allowing for precise division
        // A non-zero time will be at least 1e24, allowing for at least 15 decimal places of precision, assuming
        // 1e9 max liquidity
        time = time << 80;

        return time / value;
    }

    function calculateTimeWeightedAverage(
        uint112 cumulativeNew,
        uint112 cumulativeOld,
        uint256 deltaTime
    ) internal pure virtual override returns (uint256) {
        unchecked {
            // Underflow is desired and results in correct functionality
            return (deltaTime << 80) / (cumulativeNew - cumulativeOld);
        }
    }
}
