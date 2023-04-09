//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./IAveragingStrategy.sol";

/// @title HarmonicAveraging
/// @notice A strategy for calculating weighted averages using the harmonic mean.
contract HarmonicAveraging is IAveragingStrategy {
    /// @inheritdoc IAveragingStrategy
    /// @dev Zero values are replaced with one as we cannot divide by zero.
    function calculateWeightedValue(uint256 value, uint256 weight) external pure override returns (uint256) {
        return _calculateWeightedValue(value, weight);
    }

    /// @inheritdoc IAveragingStrategy
    function calculateWeightedAverage(
        uint256 totalWeightedValues,
        uint256 totalWeight
    ) external pure override returns (uint256) {
        return _calculateWeightedAverage(totalWeightedValues, totalWeight);
    }

    function _calculateWeightedValue(uint256 value, uint256 weight) internal pure virtual returns (uint256) {
        if (value == 0) {
            // We cannot divide by 0, so we use 1 as a substitute
            value = 1;
        }

        return weight / value;
    }

    function _calculateWeightedAverage(
        uint256 totalWeightedValues,
        uint256 totalWeight
    ) internal pure virtual returns (uint256) {
        return totalWeight / totalWeightedValues;
    }
}
