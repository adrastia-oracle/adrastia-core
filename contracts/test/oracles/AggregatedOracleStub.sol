// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../oracles/AggregatedOracle.sol";

contract AggregatedOracleStub is AggregatedOracle {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool quoteTokenDecimalsOverridden;
        uint8 quoteTokenDecimals;
        bool liquidityDecimalsOverridden;
        uint8 liquidityDecimals;
    }

    Config public config;

    constructor(AggregatedOracleParams memory params) AggregatedOracle(params) {}

    function stubPush(
        address token,
        uint112 price,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity,
        uint32 timestamp
    ) public {
        ObservationLibrary.Observation memory observation;

        observation.price = price;
        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
        observation.timestamp = timestamp;

        push(token, observation);
    }

    function stubInitializeBuffers(address token) public {
        initializeBuffers(token);
    }

    function stubInitialCardinality() public view returns (uint256) {
        return initialCapacity;
    }

    function stubSetLiquidityDecimals(uint8 decimals) public {
        config.liquidityDecimalsOverridden = true;
        config.liquidityDecimals = decimals;
    }

    function stubSetQuoteTokenDecimals(uint8 decimals) public {
        config.quoteTokenDecimalsOverridden = true;
        config.quoteTokenDecimals = decimals;
    }

    function stubSetObservation(
        address token,
        uint112 price,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity,
        uint32 timestamp
    ) public {
        ObservationLibrary.Observation memory observation;

        observation.price = price;
        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
        observation.timestamp = timestamp;

        push(token, observation);
    }

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    function stubCalculateMaxAge() public view returns (uint256) {
        return calculateMaxAge();
    }

    /* Overridden functions */

    function needsUpdate(bytes memory data) public view virtual override(IUpdateable, PeriodicOracle) returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return PeriodicOracle.needsUpdate(data);
    }

    function quoteTokenDecimals() public view virtual override returns (uint8) {
        if (config.quoteTokenDecimalsOverridden) return config.quoteTokenDecimals;
        else return super.quoteTokenDecimals();
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        if (config.liquidityDecimalsOverridden) return config.liquidityDecimals;
        else return super.liquidityDecimals();
    }
}
