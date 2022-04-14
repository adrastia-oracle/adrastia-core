// SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "../libraries/SafeCastExt.sol";

contract SafeCastExtStub {
    using SafeCastExt for uint256;

    function stubToUint112(uint256 value) external pure returns (uint112) {
        return value.toUint112();
    }
}
