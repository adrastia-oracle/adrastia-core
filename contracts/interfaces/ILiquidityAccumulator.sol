//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

pragma experimental ABIEncoderV2;

import "./IUpdateByToken.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

/**
 * @title ILiquidityAccumulator
 * @notice An interface that defines a "liquidity accumulator" - that is, cumulative liquidity levels - with a
 *   single quote token and many exchange tokens.
 * @dev Liquidity accumulators are used to calculate time-weighted average liquidity levels.
 */
abstract contract ILiquidityAccumulator is IUpdateByToken {
    /// @notice Gets the address of the quote token.
    /// @return The address of the quote token.
    function quoteToken() external view virtual returns (address);

    /// @notice Gets the number of decimal places to be used for calculating changes in liquidity levels.
    /// @return The number of decimal places to be used for calculating changes in liquidity levels.
    function changePrecision() external view virtual returns (uint256);

    /**
     * @notice Calculates a liquidity levels from two different cumulative liquidity levels.
     * @param firstAccumulation The first cumulative liquidity levels.
     * @param secondAccumulation The last cumulative liquidity levels.
     * @dev Reverts if the timestamp of the first accumulation is 0, or if it's not strictly less than the timestamp of
     *  the second.
     * @return tokenLiquidity A time-weighted average liquidity level for a token, in wei, derived from two cumulative
     *  liquidity levels.
     * @return quoteTokenLiquidity A time-weighted average liquidity level for the quote token, in wei, derived from two
     *  cumulative liquidity levels.
     */
    function calculateLiquidity(
        AccumulationLibrary.LiquidityAccumulator calldata firstAccumulation,
        AccumulationLibrary.LiquidityAccumulator calldata secondAccumulation
    ) external pure virtual returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity);

    /// @notice Gets the last cumulative liquidity levels for the token and quote token that was stored.
    /// @param token The address of the token to get the cumulative liquidity levels for (with the quote token).
    /// @return The last cumulative liquidity levels (in wei) along with the timestamp of those levels.
    function getLastAccumulation(address token)
        public
        view
        virtual
        returns (AccumulationLibrary.LiquidityAccumulator memory);

    /// @notice Gets the current cumulative liquidity levels for the token and quote token.
    /// @param token The address of the token to get the cumulative liquidity levels for (with the quote token).
    /// @return The current cumulative liquidity levels (in wei) along with the timestamp of those levels.
    function getCurrentAccumulation(address token)
        public
        view
        virtual
        returns (AccumulationLibrary.LiquidityAccumulator memory);

    /// @notice Gets the last calculated time-weighted average liquidity levels of a token and the quote token.
    /// @param token The address of the token to get the liquidity levels for (with the quote token).
    /// @return The last liquidity levels (in wei) along with the timestamp of those levels.
    function getLastObservation(address token)
        public
        view
        virtual
        returns (ObservationLibrary.LiquidityObservation memory);

    /// @notice Gets the current calculated time-weighted average liquidity levels of a token and the quote token.
    /// @param token The address of the token to get the liquidity levels for (with the quote token).
    /// @return The current liquidity levels (in wei) along with the timestamp of those levels.
    function getCurrentObservation(address token)
        public
        view
        virtual
        returns (ObservationLibrary.LiquidityObservation memory);
}
