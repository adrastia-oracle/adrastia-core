// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/offchain/OffchainPriceAccumulator.sol";

contract OffchainPriceAccumulatorStub is OffchainPriceAccumulator {
    struct Config {
        bool validateObservationOverridden;
        bool validateObservation;
    }

    Config public config;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) OffchainPriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function stubValidateObservation(bytes memory updateData, uint112 price) public returns (bool) {
        return validateObservation(updateData, price);
    }

    function overrideValidateObservationTime(bool overridden, bool validated) public {
        config.validateObservationOverridden = overridden;
        config.validateObservation = validated;
    }

    function validateObservationTime(uint32 timestamp) internal override returns (bool) {
        if (config.validateObservationOverridden) {
            return config.validateObservation;
        }

        return super.validateObservationTime(timestamp);
    }
}
