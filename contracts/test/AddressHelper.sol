// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

contract AddressHelper {
    function lessThan(address a, address b) external pure returns (bool) {
        return a < b;
    }

    function greaterThan(address a, address b) external pure returns (bool) {
        return a > b;
    }
}
