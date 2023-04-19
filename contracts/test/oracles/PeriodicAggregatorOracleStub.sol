// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../oracles/PeriodicAggregatorOracle.sol";

contract PeriodicAggregatorOracleStub is PeriodicAggregatorOracle {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool quoteTokenDecimalsOverridden;
        uint8 quoteTokenDecimals;
        bool liquidityDecimalsOverridden;
        uint8 liquidityDecimals;
    }

    Config public config;

    constructor(
        AbstractAggregatorOracleParams memory params,
        uint256 period_,
        uint256 granularity_
    ) PeriodicAggregatorOracle(params, period_, granularity_) {}

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

    function stubCalculateMaxAge(address token) public view returns (uint256) {
        return calculateMaxAge(token);
    }

    /* Overridden functions */

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
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
