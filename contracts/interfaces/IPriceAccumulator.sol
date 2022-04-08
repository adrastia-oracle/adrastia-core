//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

pragma experimental ABIEncoderV2;

import "./IUpdateByToken.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

/**
 * @title IPriceAccumulator
 * @notice An interface that defines a "price accumulator" - that is, a cumulative price - with a single quote token
 *   and many exchange tokens.
 * @dev Price accumulators are used to calculate time-weighted average prices.
 */
abstract contract IPriceAccumulator is IUpdateByToken {
    /// @notice Gets the number of decimal places to be used for calculating changes in price.
    /// @return The number of decimal places to be used for calculating changes in price.
    function changePrecision() external view virtual returns (uint256);

    /**
     * @notice Calculates a price from two different cumulative prices.
     * @param firstAccumulation The first cumulative price.
     * @param secondAccumulation The last cumulative price.
     * @dev Reverts if the timestamp of the first accumulation is 0, or if it's not strictly less than the timestamp of
     *  the second.
     * @return price A time-weighted average price derived from two cumulative prices.
     */
    function calculatePrice(
        AccumulationLibrary.PriceAccumulator calldata firstAccumulation,
        AccumulationLibrary.PriceAccumulator calldata secondAccumulation
    ) external pure virtual returns (uint112 price);

    /// @notice Gets the last cumulative price that was stored.
    /// @param token The address of the token to get the cumulative price for.
    /// @return The last cumulative price along with the timestamp of that price.
    function getLastAccumulation(address token)
        public
        view
        virtual
        returns (AccumulationLibrary.PriceAccumulator memory);

    /// @notice Gets the current cumulative price.
    /// @param token The address of the token to get the cumulative price for.
    /// @return The current cumulative price along with the timestamp of that price.
    function getCurrentAccumulation(address token)
        public
        view
        virtual
        returns (AccumulationLibrary.PriceAccumulator memory);

    /// @notice Gets the last calculated time-weighted average price of a token.
    /// @param token The address of the token to get the price for.
    /// @return The last price along with the timestamp of that price.
    function getLastObservation(address token) public view virtual returns (ObservationLibrary.PriceObservation memory);

    /// @notice Gets the current calculated time-weighted average price of a token.
    /// @param token The address of the token to get the price for.
    /// @return The current price along with the timestamp of that price.
    function getCurrentObservation(address token)
        public
        view
        virtual
        returns (ObservationLibrary.PriceObservation memory);
}
