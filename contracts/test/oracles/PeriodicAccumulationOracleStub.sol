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

    function needsUpdate(address token) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(token);
    }

    function _update(address token) internal virtual override returns (bool) {
        // Always keep the liquidity accumulator updated so that we don't have to do so in our tests.
        try ILiquidityAccumulator(liquidityAccumulator).update(token) returns (bool) {} catch Error(
            string memory
        ) {} catch (bytes memory) {}

        // Always keep the price accumulator updated so that we don't have to do so in our tests.
        try IPriceAccumulator(priceAccumulator).update(token) returns (bool) {} catch Error(string memory) {} catch (
            bytes memory
        ) {}

        return super._update(token);
    }
}
