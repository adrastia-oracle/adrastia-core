//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

/**
 * @title IPeriodic
 * @notice An interface that defines a contract containing a period.
 * @dev This typically refers to an update period.
 */
interface IPeriodic {
    /// @notice Gets the period, in seconds.
    /// @return periodSeconds The period, in seconds.
    function period() external view returns (uint256 periodSeconds);

    // @notice Gets the number of observations made every period.
    // @return granularity The number of observations made every period.
    function granularity() external view returns (uint256 granularity);
}
