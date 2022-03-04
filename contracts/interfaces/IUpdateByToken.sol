//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

/// @title IUpdateByToken
/// @notice An interface that defines a contract that is updateable per specific token addresses.
abstract contract IUpdateByToken {
    /// @notice Checks if an update needs to be performed.
    /// @param token The token address that the update is for.
    /// @return True if an update needs to be performed; false otherwise.
    function needsUpdate(address token) public view virtual returns (bool);

    /// @notice Performs an update per specific token address.
    /// @return True if anything was updated; false otherwise.
    function update(address token) external virtual returns (bool);
}
