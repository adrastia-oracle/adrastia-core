//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@prb/math/contracts/PRBMathUD60x18.sol";

import "./PriceAccumulator.sol";

abstract contract GeometricPriceAccumulator is PriceAccumulator {
    using PRBMathUD60x18 for uint256;
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
            // Natural log of 0 is undefined, so we use 1 as a substitute
            value = 1;
        }

        return value.fromUint().ln() * time;
    }

    function calculateTimeWeightedAverage(
        uint224 cumulativeNew,
        uint224 cumulativeOld,
        uint256 deltaTime
    ) internal pure virtual override returns (uint256) {
        uint256 encoded;
        unchecked {
            // Underflow is desired and results in correct functionality
            encoded = (cumulativeNew - cumulativeOld) / deltaTime;
        }
        return encoded.exp().toUint();
    }
}
