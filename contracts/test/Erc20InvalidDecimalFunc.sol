// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

contract Erc20InvalidDecimalFunc {
    constructor() {}

    function decimals() external pure returns (uint256, uint256) {
        return (2, 3);
    }
}
