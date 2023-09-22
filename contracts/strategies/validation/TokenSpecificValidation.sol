// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AddressSpecificValidation.sol";

contract TokenSpecificValidation is AddressSpecificValidation {
    constructor(
        uint8 quoteTokenDecimals_,
        IValidationStrategy defaultStrategy_
    ) AddressSpecificValidation(quoteTokenDecimals_, defaultStrategy_) {}

    function _extractSelector(address token, address) internal view virtual override returns (address) {
        return token;
    }
}
