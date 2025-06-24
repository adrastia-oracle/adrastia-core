// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../strategies/aggregation/AbstractAggregator.sol";

contract AggregatorStub is AbstractAggregator {
    struct Config {
        uint256 price;
        uint256 tokenLiquidity;
        uint256 quoteTokenLiquidity;
    }

    Config public config;

    constructor() AbstractAggregator(TimestampStrategy.ThisBlock) {}

    function aggregateObservations(
        address,
        ObservationLibrary.MetaObservation[] calldata,
        uint256,
        uint256
    ) external view override returns (ObservationLibrary.Observation memory) {
        return prepareResult(config.price, config.tokenLiquidity, config.quoteTokenLiquidity, block.timestamp);
    }

    function stubSetObservation(uint256 price, uint256 tokenLiquidity, uint256 quoteTokenLiquidity) public {
        config.price = price;
        config.tokenLiquidity = tokenLiquidity;
        config.quoteTokenLiquidity = quoteTokenLiquidity;
    }
}
