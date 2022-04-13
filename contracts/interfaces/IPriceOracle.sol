//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";
import "./IQuoteToken.sol";

/// @title IPriceOracle
/// @notice An interface that defines a price oracle with a single quote token (or currency) and many exchange tokens.
abstract contract IPriceOracle is IUpdateByToken, IQuoteToken {
    /**
     * @notice Gets the price of a token in terms of the quote token.
     * @param token The token to get the price of.
     * @return price The quote token denominated price for a whole token.
     */
    function consultPrice(address token) public view virtual returns (uint256 price);

    /**
     * @notice Gets the price of a token in terms of the quote token, reverting if the quotation is older than the
     *  maximum allowable age.
     * @param token The token to get the price of.
     * @param maxAge The maximum age of the quotation, in seconds.
     * @return price The quote token denominated price for a whole token.
     */
    function consultPrice(address token, uint256 maxAge) public view virtual returns (uint256 price);
}
