//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

/// @title IAveragingStrategy
/// @notice An interface defining a strategy for calculating weighted averages.
interface IAveragingStrategy {
    /// @notice Calculates a weighted value.
    /// @param value The value to weight.
    /// @param weight The weight to apply to the value.
    /// @return The weighted value.
    function calculateWeightedValue(uint256 value, uint256 weight) external pure returns (uint256);

    /// @notice Calculates a weighted average.
    /// @param totalWeightedValues The sum of the weighted values.
    /// @param totalWeight The sum of the weights.
    /// @return The weighted average.
    function calculateWeightedAverage(uint256 totalWeightedValues, uint256 totalWeight) external pure returns (uint256);
}
