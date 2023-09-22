// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AddressSpecificValidation.sol";

contract OracleSpecificValidation is AddressSpecificValidation {
    constructor(
        uint8 quoteTokenDecimals_,
        IValidationStrategy defaultStrategy_
    ) AddressSpecificValidation(quoteTokenDecimals_, defaultStrategy_) {}

    function _extractSelector(address, address oracle) internal view virtual override returns (address) {
        return oracle;
    }
}
