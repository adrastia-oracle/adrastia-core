// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@prb/math/contracts/PRBMathUD60x18.sol";

contract MathUtil {
    using PRBMathUD60x18 for uint256;

    function shl(uint256 x, uint256 y) external pure returns (uint256) {
        return x << y;
    }

    function shr(uint256 x, uint256 y) external pure returns (uint256) {
        return x >> y;
    }

    function ln(uint256 x) external pure returns (uint256) {
        return x.fromUint().ln();
    }

    function exp(uint256 x) external pure returns (uint256) {
        return x.exp().toUint();
    }
}
