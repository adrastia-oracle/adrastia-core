//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

/// @title ICurvePool
/// @notice A simple interface for accessing various Curve pool functions.
interface ICurvePool {
    function get_dy(
        int128 i,
        int128 j,
        uint256 dx
    ) external view returns (uint256);

    function coins(uint256 index) external view returns (address);

    function balances(uint256 index) external view returns (uint256);
}
