// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow checks.
 * Adapted from OpenZeppelin's SafeMath library.
 */
library Math {
    // solhint-disable no-inline-assembly

    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        return a * b;
    }

    function divDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return a / b;
    }

    function divUp(uint256 a, uint256 b) internal pure returns (uint256 result) {
        return a == 0 ? 0 : 1 + (a - 1) / b;
    }
}
