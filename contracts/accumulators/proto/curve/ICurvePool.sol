//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

/// @title ICurvePool
/// @notice A simple interface for accessing various Curve pool functions.
interface ICurvePool {
    /**
     * @notice Gets the current price of `dx` tokens, less the admin fees.
     * @param i The index value for the coin to get the price for.
     * @param j The index value for the coin for which the price is denominated in.
     * @param dx The number of coins with index `i` to calculate the price of.
     * @return The price.
     */
    function get_dy(
        int128 i,
        int128 j,
        uint256 dx
    ) external view returns (uint256);

    /**
     * @notice Gets the address of one of the coins in the pool.
     * @param index The index value for the coin.
     * @return The address of the coin at index `index`.
     */
    function coins(uint256 index) external view returns (address);

    /**
     * @notice Get the current balance of a coin within the pool, less the accrued admin fees.
     * @param index The index value for the coin to query balance of.
     * @return The token balance.
     */
    function balances(uint256 index) external view returns (uint256);
}
