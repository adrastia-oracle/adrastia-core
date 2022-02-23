//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";

/// @title IPriceOracle
/// @notice An interface that defines a price oracle with a single quote token (or currency) and many exchange tokens.
abstract contract IPriceOracle is IUpdateByToken {
    /// @notice Gets the quote token (or currency) name.
    /// @return The name of the quote token (or currency).
    function quoteTokenName() public view virtual returns (string memory);

    /// @notice Gets the quote token address (if any).
    /// @dev This may return address(0) if no specific quote token is used (such as an aggregate of quote tokens).
    /// @return The address of the quote token, or address(0) if no specific quote token is used.
    function quoteTokenAddress() public view virtual returns (address);

    /// @notice Gets the quote token (or currency) symbol.
    /// @return The symbol of the quote token (or currency).
    function quoteTokenSymbol() public view virtual returns (string memory);

    /// @notice Gets the number of decimal places that quote prices have.
    /// @return The number of decimals of the quote token (or currency) that quote prices have.
    function quoteTokenDecimals() public view virtual returns (uint8);

    /**
     * @notice Gets the price of a token in terms of the quote token.
     * @param token The token to get the price of.
     * @return price The price of the specified token in terms of the quote token, scaled by the quote token decimal
     *  places.
     */
    function consultPrice(address token) public view virtual returns (uint256 price);

    /**
     * @notice Gets the price of a token in terms of the quote token, reverting if the quotation is older than the
     *  maximum allowable age.
     * @param token The token to get the price of.
     * @param maxAge The maximum age of the quotation, in seconds.
     * @return price The price of the specified token in terms of the quote token, scaled by the quote token decimal
     *  places.
     */
    function consultPrice(address token, uint256 maxAge) public view virtual returns (uint256 price);
}
