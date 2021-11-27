//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";

abstract contract IPriceOracle is IUpdateByToken {
    function quoteTokenName() external view virtual returns (string memory);

    function quoteTokenAddress() external view virtual returns (address);

    function quoteTokenSymbol() external view virtual returns (string memory);

    function quoteTokenDecimals() external view virtual returns (uint8);

    function consultPrice(address token) public view virtual returns (uint256 price);

    function consultPrice(address token, uint256 maxAge) public view virtual returns (uint256 price);
}
