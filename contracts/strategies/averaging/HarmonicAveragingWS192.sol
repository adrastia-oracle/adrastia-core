//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./HarmonicAveraging.sol";

/// @title HarmonicAveragingWS192
/// @notice A strategy for calculating weighted averages using the harmonic mean, with weights shifted to the left by
///   192 bits.
contract HarmonicAveragingWS192 is HarmonicAveraging {
    function _calculateWeightedValue(uint256 value, uint256 weight) internal pure override returns (uint256) {
        return super._calculateWeightedValue(value, weight << 192);
    }

    function _calculateWeightedAverage(
        uint256 totalWeightedValues,
        uint256 totalWeight
    ) internal pure override returns (uint256) {
        return super._calculateWeightedAverage(totalWeightedValues, totalWeight << 192);
    }
}
