// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {ERC4626, IERC20, ERC20} from "@openzeppelin-v4/contracts/token/ERC20/extensions/ERC4626.sol";

contract MockVault is ERC4626 {
    uint8 private _decimalOffset;

    constructor(IERC20 asset) ERC4626(asset) ERC20("Vault", "V") {
        _decimalOffset = 0;
    }

    function setDecimalOffset(uint8 offset) public {
        _decimalOffset = offset;
    }

    function _decimalsOffset() internal view virtual override returns (uint8) {
        return _decimalOffset;
    }
}
