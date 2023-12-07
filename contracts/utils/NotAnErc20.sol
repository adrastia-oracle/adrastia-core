// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/ERC20.sol";

/**
 * @title NotAnErc20
 * @author TRILEZ SOFTWARE INC. dba. Adrastia
 * @notice An ERC20 implementation meant to be used in Adrastia oracle contracts to provide custom quote token metadata.
 */
contract NotAnErc20 is ERC20 {
    uint8 internal immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
