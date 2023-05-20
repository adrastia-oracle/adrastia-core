//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

/// @title IAveragingStrategy
/// @notice An interface defining a strategy for calculating weighted averages.
interface IAveragingStrategy {
    /// @notice An error that is thrown when we try calculating a weighted average with a total weight of zero.
    /// @dev A total weight of zero is ambiguous, so we throw an error.
    error TotalWeightCannotBeZero();

    /// @notice Calculates a weighted value.
    /// @param value The value to weight.
    /// @param weight The weight to apply to the value.
    /// @return The weighted value.
    function calculateWeightedValue(uint256 value, uint256 weight) external pure returns (uint256);

    /// @notice Calculates a weighted average.
    /// @param totalWeightedValues The sum of the weighted values.
    /// @param totalWeight The sum of the weights.
    /// @return The weighted average.
    /// @custom:throws TotalWeightCannotBeZero if the total weight is zero.
    function calculateWeightedAverage(uint256 totalWeightedValues, uint256 totalWeight) external pure returns (uint256);
}
