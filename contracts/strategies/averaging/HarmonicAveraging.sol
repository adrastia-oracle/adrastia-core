// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "./AbstractAveraging.sol";

/// @title HarmonicAveraging
/// @notice A strategy for calculating weighted averages using the harmonic mean.
contract HarmonicAveraging is AbstractAveraging {
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
        if (totalWeight == 0) {
            // Ambiguous result, so we revert
            revert TotalWeightCannotBeZero();
        }

        if (totalWeightedValues == 0) {
            // If the total weighted values are 0, then the average must be zero as we know that the total weight is not
            // zero. i.e. all of the values are zero so the average must be zero.
            return 0;
        }

        return totalWeight / totalWeightedValues;
    }
}
