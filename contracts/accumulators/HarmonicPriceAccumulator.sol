//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./PriceAccumulator.sol";

abstract contract HarmonicPriceAccumulator is PriceAccumulator {
    using SafeCast for uint256;
    using SafeCastExt for uint256;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function calculateTimeWeightedValue(uint256 value, uint256 time) internal pure virtual override returns (uint256) {
        if (value == 0) {
            // We cannot divide by 0, so we use 1 as a substitute
            value = 1;
        }

        // Shift time to the left by 192 bits to allow for precise division by a uint112
        time = time << 192;

        return time / value;
    }

    function calculateTimeWeightedAverage(
        uint224 cumulativeNew,
        uint224 cumulativeOld,
        uint256 deltaTime
    ) internal pure virtual override returns (uint256) {
        unchecked {
            // Underflow is desired and results in correct functionality
            return (deltaTime << 192) / (cumulativeNew - cumulativeOld);
        }
    }
}
