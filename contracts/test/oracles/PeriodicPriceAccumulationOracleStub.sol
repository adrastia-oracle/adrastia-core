// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../oracles/PeriodicPriceAccumulationOracle.sol";

contract PeriodicPriceAccumulationOracleStub is PeriodicPriceAccumulationOracle {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
    }

    Config public config;

    constructor(
        address priceAccumulator_,
        address quoteToken_,
        uint256 period_,
        uint256 granularity_,
        uint112 staticTokenLiquidity_,
        uint112 staticQuoteTokenLiquidity_,
        uint8 liquidityDecimals_
    )
        PeriodicPriceAccumulationOracle(
            priceAccumulator_,
            quoteToken_,
            period_,
            granularity_,
            staticTokenLiquidity_,
            staticQuoteTokenLiquidity_,
            liquidityDecimals_
        )
    {}

    function stubPush(address token, uint224 cumulativePrice, uint32 priceTimestamp, uint112, uint112, uint32) public {
        AccumulationLibrary.PriceAccumulator memory priceAccumulation;

        priceAccumulation.cumulativePrice = cumulativePrice;
        priceAccumulation.timestamp = priceTimestamp;

        push(token, priceAccumulation);
    }

    function stubInitializeBuffers(address token) public {
        initializeBuffers(token);
    }

    function priceAccumulations(address token) public view returns (AccumulationLibrary.PriceAccumulator memory) {
        return priceAccumulationBuffers[token][accumulationBufferMetadata[token].end];
    }

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

    function stubSetAccumulations(address token, uint112 cumulativePrice, uint112, uint112, uint32 timestamp) public {
        ensureBuffersInitialized(token);

        BufferMetadata storage meta = accumulationBufferMetadata[token];

        AccumulationLibrary.PriceAccumulator storage priceAccumulation = priceAccumulationBuffers[token][meta.end];

        priceAccumulation.cumulativePrice = cumulativePrice;
        priceAccumulation.timestamp = timestamp;
    }

    function stubSetPriceAccumulation(address token, uint112 cumulativePrice, uint32 timestamp) public {
        ensureBuffersInitialized(token);

        BufferMetadata storage meta = accumulationBufferMetadata[token];

        AccumulationLibrary.PriceAccumulator storage priceAccumulation = priceAccumulationBuffers[token][meta.end];

        priceAccumulation.cumulativePrice = cumulativePrice;
        priceAccumulation.timestamp = timestamp;
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
        // Always keep the price accumulator updated so that we don't have to do so in our tests.
        try IUpdateable(priceAccumulator).update(data) returns (bool) {} catch Error(string memory) {} catch (
            bytes memory
        ) {}

        return super.performUpdate(data);
    }

    function ensureBuffersInitialized(address token) internal virtual {
        BufferMetadata storage meta = accumulationBufferMetadata[token];

        if (meta.size == 0) {
            AccumulationLibrary.PriceAccumulator memory priceAccumulation;

            push(token, priceAccumulation);
        }
    }
}
