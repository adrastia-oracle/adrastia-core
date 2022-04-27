// SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "../../oracles/PeriodicAccumulationOracle.sol";

contract PeriodicAccumulationOracleStub is PeriodicAccumulationOracle {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
    }

    Config public config;

    constructor(
        address liquidityAccumulator_,
        address priceAccumulator_,
        address quoteToken_,
        uint256 period_
    ) PeriodicAccumulationOracle(liquidityAccumulator_, priceAccumulator_, quoteToken_, period_) {}

    function stubSetObservation(
        address token,
        uint112 price,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity,
        uint32 timestamp
    ) public {
        ObservationLibrary.Observation storage observation = observations[token];

        observation.price = price;
        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
        observation.timestamp = timestamp;
    }

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    /* Overridden functions */

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
    }

    function performUpdate(bytes memory data) internal virtual override returns (bool) {
        // Always keep the liquidity accumulator updated so that we don't have to do so in our tests.
        try IUpdateable(liquidityAccumulator).update(data) returns (bool) {} catch Error(string memory) {} catch (
            bytes memory
        ) {}

        // Always keep the price accumulator updated so that we don't have to do so in our tests.
        try IUpdateable(priceAccumulator).update(data) returns (bool) {} catch Error(string memory) {} catch (
            bytes memory
        ) {}

        return super.performUpdate(data);
    }
}
