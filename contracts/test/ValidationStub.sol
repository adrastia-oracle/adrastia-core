// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../strategies/validation/IValidationStrategy.sol";

contract ValidationStub is IValidationStrategy {
    struct Config {
        uint8 quoteTokenDecimals;
        bool isValid;
    }

    struct OracleConfig {
        bool enabled;
        bool isValid;
    }

    Config public config;

    mapping(address => OracleConfig) public oracleConfigs;

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

    function stubSetOracleConfig(address oracle, bool enabled, bool isValid) public {
        OracleConfig storage oracleConfig = oracleConfigs[oracle];

        oracleConfig.enabled = enabled;
        oracleConfig.isValid = isValid;
    }

    function quoteTokenDecimals() external view override returns (uint8) {
        return config.quoteTokenDecimals;
    }

    function validateObservation(
        address,
        ObservationLibrary.MetaObservation calldata observation
    ) external view override returns (bool) {
        OracleConfig memory oracleConfig = oracleConfigs[observation.metadata.oracle];
        if (oracleConfig.enabled) {
            return oracleConfig.isValid;
        }

        return config.isValid;
    }
}
