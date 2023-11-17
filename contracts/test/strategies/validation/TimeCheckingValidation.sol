// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../strategies/validation/IValidationStrategy.sol";
import "../../../interfaces/IUpdateable.sol";

import "hardhat/console.sol";

contract TimeCheckingValidation is IValidationStrategy {
    struct Config {
        uint8 quoteTokenDecimals;
        bool isValid;
    }

    Config public config;

    address aggregator;

    constructor() {
        config.quoteTokenDecimals = 18;
        config.isValid = true;
    }

    function setAggregator(address aggregator_) public {
        aggregator = aggregator_;
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

    function validateObservation(
        address token,
        ObservationLibrary.MetaObservation calldata observation
    ) external view override returns (bool) {
        require(aggregator != address(0), "Aggregator address is zero");

        address oracle = observation.metadata.oracle;
        if (oracle == aggregator) {
            require(observation.data.timestamp == block.timestamp, "Timestamp should equal block timestamp");
        } else {
            // Underlying oracle consultation used... check it

            uint256 lastUpdatedTime = IUpdateable(oracle).lastUpdateTime(abi.encode(token));
            require(observation.data.timestamp == lastUpdatedTime, "Timestamp should equal lastUpdatedTime");
        }

        return config.isValid;
    }
}
