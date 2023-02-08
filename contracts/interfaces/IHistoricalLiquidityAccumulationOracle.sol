//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "../libraries/AccumulationLibrary.sol";

/**
 * @title IHistoricalLiquidityAccumulationOracle
 * @notice An interface that defines an oracle contract that stores historical liquidity accumulations.
 */
interface IHistoricalLiquidityAccumulationOracle {
    /// @notice Gets a liquidity accumulation for a token at a specific index.
    /// @param token The address of the token to get the accumulation for.
    /// @param index The index of the accumulation to get, where index 0 contains the latest accumulation, and the last
    ///   index contains the oldest accumulation (uses reverse chronological ordering).
    /// @return The accumulation for the token at the specified index.
    function getLiquidityAccumulationAt(
        address token,
        uint256 index
    ) external view returns (AccumulationLibrary.LiquidityAccumulator memory);

    /// @notice Gets the latest liquidity accumulations for a token.
    /// @param token The address of the token to get the accumulations for.
    /// @param amount The number of accumulations to get.
    /// @return The latest accumulations for the token, in reverse chronological order, from newest to oldest.
    function getLiquidityAccumulations(
        address token,
        uint256 amount
    ) external view returns (AccumulationLibrary.LiquidityAccumulator[] memory);

    /// @notice Gets the latest liquidity accumulations for a token.
    /// @param token The address of the token to get the accumulations for.
    /// @param amount The number of accumulations to get.
    /// @param offset The index of the first accumulations to get (default: 0).
    /// @param increment The increment between accumulations to get (default: 1).
    /// @return The latest accumulations for the token, in reverse chronological order, from newest to oldest.
    function getLiquidityAccumulations(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) external view returns (AccumulationLibrary.LiquidityAccumulator[] memory);

    /// @notice Gets the number of liquidity accumulations for a token.
    /// @param token The address of the token to get the number of accumulations for.
    /// @return count The number of accumulations for the token.
    function getLiquidityAccumulationsCount(address token) external view returns (uint256);

    /// @notice Gets the capacity of liquidity accumulations for a token.
    /// @param token The address of the token to get the capacity of accumulations for.
    /// @return capacity The capacity of accumulations for the token.
    function getLiquidityAccumulationsCapacity(address token) external view returns (uint256);

    /// @notice Sets the capacity of liquidity accumulations for a token.
    /// @param token The address of the token to set the capacity of accumulations for.
    /// @param amount The new capacity of accumulations for the token.
    function setLiquidityAccumulationsCapacity(address token, uint256 amount) external;
}
