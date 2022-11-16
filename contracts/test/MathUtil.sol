// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

contract MathUtil {
    function shl(uint256 x, uint256 y) external pure returns (uint256) {
        return x << y;
    }

    function shr(uint256 x, uint256 y) external pure returns (uint256) {
        return x >> y;
    }
}
