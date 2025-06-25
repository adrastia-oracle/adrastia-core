// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../../strategies/aggregation/AbstractAggregator.sol";

contract AggregatorStub is AbstractAggregator {
    struct Config {
        uint256 price;
        uint256 tokenLiquidity;
        uint256 quoteTokenLiquidity;
        uint256 timestamp;
    }

    Config public config;

    constructor(TimestampStrategy timestampStrategy_) AbstractAggregator(timestampStrategy_) {}

    function stubValidateTimestampStrategy(uint8 strategy) public pure {
        validateTimestampStrategy(TimestampStrategy(strategy));
    }

    function stubCalculateFinalTimestamp(uint256[] memory timestamps) public view returns (uint256) {
        return calculateFinalTimestamp(timestamps);
    }

    function aggregateObservations(
        address,
        ObservationLibrary.MetaObservation[] calldata,
        uint256,
        uint256
    ) external view override returns (ObservationLibrary.Observation memory) {
        return prepareResult(config.price, config.tokenLiquidity, config.quoteTokenLiquidity, config.timestamp);
    }

    function stubSetObservation(
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity,
        uint256 timestamp
    ) public {
        config.price = price;
        config.tokenLiquidity = tokenLiquidity;
        config.quoteTokenLiquidity = quoteTokenLiquidity;
        config.timestamp = timestamp;
    }
}
