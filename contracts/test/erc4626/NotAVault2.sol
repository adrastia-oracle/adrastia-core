// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {MockVault, IERC20} from "./MockVault.sol";

contract NotAVault2 {
    function asset() public view returns (address, bool) {
        return (address(0), true);
    }
}
