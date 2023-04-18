//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../strategies/validation/IValidationStrategy.sol";

contract ValidationStub is IValidationStrategy {
    struct Config {
        uint8 quoteTokenDecimals;
        bool isValid;
    }

    Config public config;

    constructor() {
        config.quoteTokenDecimals = 18;
        config.isValid = true;
    }

    function stubSetQuoteTokenDecimals(uint8 decimals) public {
        config.quoteTokenDecimals = decimals;
    }

    function stubSetIsValid(bool isValid) public {
        config.isValid = isValid;
    }

    function quoteTokenDecimals() external view override returns (uint8) {
        return config.quoteTokenDecimals;
    }

    function validateObservation(ObservationLibrary.Observation calldata) external view override returns (bool) {
        return config.isValid;
    }
}
