// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/offchain/OffchainLiquidityAccumulator.sol";

contract OffchainLiquidityAccumulatorStub is OffchainLiquidityAccumulator {
    struct Config {
        bool validateObservationOverridden;
        bool validateObservation;
    }

    Config public config;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        OffchainLiquidityAccumulator(
            averagingStrategy_,
            quoteToken_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubValidateObservation(
        bytes memory updateData,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) public returns (bool) {
        return validateObservation(updateData, tokenLiquidity, quoteTokenLiquidity);
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
