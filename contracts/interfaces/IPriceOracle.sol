//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";

abstract contract IPriceOracle is IUpdateByToken {
    function quoteTokenAddress() public view virtual returns (address);

    function quoteTokenSymbol() public view virtual returns (string memory);

    function consultPrice(address token) public view virtual returns (uint256 price);

    function consultPrice(address token, uint256 maxAge) public view virtual returns (uint256 price);
}
