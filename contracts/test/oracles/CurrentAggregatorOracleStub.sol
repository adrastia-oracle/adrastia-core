// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../oracles/CurrentAggregatorOracle.sol";

contract CurrentAggregatorOracleStub is CurrentAggregatorOracle {
    struct Config {
        bool changeThresholdOverridden;
        bool changeThresholdPassed;
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool quoteTokenDecimalsOverridden;
        uint8 quoteTokenDecimals;
        bool liquidityDecimalsOverridden;
        uint8 liquidityDecimals;
        bool minimumResponsesOverridden;
        uint256 minimumResponses;
    }

    Config public config;

    constructor(
        AbstractAggregatorOracleParams memory params,
        uint256 updateThreshold_,
        uint256 updateDelay_,
        uint256 heartbeat_
    ) CurrentAggregatorOracle(params, updateThreshold_, updateDelay_, heartbeat_) {}

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

    function overrideChangeThresholdPassed(bool overridden, bool changeThresholdPassed) public {
        config.changeThresholdOverridden = overridden;
        config.changeThresholdPassed = changeThresholdPassed;
    }

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    function overrideMinimumResponses(bool overridden, uint256 minimumResponses_) public {
        config.minimumResponsesOverridden = overridden;
        config.minimumResponses = minimumResponses_;
    }

    function stubCalculateMaxAge(address token) public view returns (uint256) {
        return _maximumResponseAge(token);
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

    function changeThresholdSurpassed(
        bytes memory data,
        uint256 changeThreshold
    ) public view virtual override returns (bool) {
        if (config.changeThresholdOverridden) return config.changeThresholdPassed;
        else return super.changeThresholdSurpassed(data, changeThreshold);
    }

    function _minimumResponses(address token) internal view virtual override returns (uint256) {
        if (config.minimumResponsesOverridden) return config.minimumResponses;
        else return super._minimumResponses(token);
    }
}
