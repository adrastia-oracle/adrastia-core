// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {MockVault, IERC20} from "./MockVault.sol";

contract NotAVault1 {
    function asset() public view {}
}
