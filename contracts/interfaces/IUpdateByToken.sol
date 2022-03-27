//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

/// @title IUpdateByToken
/// @notice An interface that defines a contract that is updateable per specific token addresses.
abstract contract IUpdateByToken {
    /// @notice Performs an update per specific token address.
    /// @param token The token address that the update is for.
    /// @return b True if anything was updated; false otherwise.
    function update(address token) external virtual returns (bool b);

    /// @notice Checks if an update needs to be performed.
    /// @param token The token address that the update is for.
    /// @return b True if an update needs to be performed; false otherwise.
    function needsUpdate(address token) public view virtual returns (bool b);

    /// @notice Check if an update can be performed by the caller (if needed).
    /// @dev Tries to determine if the caller can call update with a valid observation being stored.
    /// @param token The token address that the update is for.
    /// @return b True if an update can be performed by the caller; false otherwise.
    function canUpdate(address token) public view virtual returns (bool b);
}
