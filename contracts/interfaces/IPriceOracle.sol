//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";

abstract contract IPriceOracle is IUpdateByToken {
    function consultPrice(address token) external view virtual returns (uint256 price);

    function consultPrice(address token, uint256 maxAge) external view virtual returns (uint256 price);
}
