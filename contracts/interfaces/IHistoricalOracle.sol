//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "../libraries/ObservationLibrary.sol";

/**
 * @title IHistoricalOracle
 * @notice An interface that defines an oracle contract that stores historical observations.
 */
interface IHistoricalOracle {
    /// @notice Gets an observation for a token at a specific index.
    /// @param token The address of the token to get the observation for.
    /// @param index The index of the observation to get, where index 0 contains the latest observation, and the last
    ///   index contains the oldest observation (uses reverse chronological ordering).
    /// @return observation The observation for the token at the specified index.
    function getObservationAt(
        address token,
        uint256 index
    ) external view returns (ObservationLibrary.Observation memory);

    /// @notice Gets the latest observations for a token.
    /// @param token The address of the token to get the observations for.
    /// @param amount The number of observations to get.
    /// @return observations The latest observations for the token, in reverse chronological order, from newest to oldest.
    function getObservations(
        address token,
        uint256 amount
    ) external view returns (ObservationLibrary.Observation[] memory);

    /// @notice Gets the number of observations for a token.
    /// @param token The address of the token to get the number of observations for.
    /// @return count The number of observations for the token.
    function getObservationsCount(address token) external view returns (uint256);

    /// @notice Gets the capacity of observations for a token.
    /// @param token The address of the token to get the capacity of observations for.
    /// @return capacity The capacity of observations for the token.
    function getObservationsCapacity(address token) external view returns (uint256);

    /// @notice Sets the capacity of observations for a token.
    /// @param token The address of the token to set the capacity of observations for.
    /// @param amount The new capacity of observations for the token.
    function setObservationsCapacity(address token, uint256 amount) external;
}
