// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../strategies/averaging/HarmonicAveragingWS140.sol";
import "../strategies/aggregation/QuoteTokenWeightedMeanAggregator.sol";

contract DefaultAggregator2 is QuoteTokenWeightedMeanAggregator, HarmonicAveragingWS140 {
    constructor(TimestampStrategy timestampStrategy) QuoteTokenWeightedMeanAggregator(this, timestampStrategy) {}

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AbstractAggregator, AbstractAveraging) returns (bool) {
        return AbstractAggregator.supportsInterface(interfaceId) || AbstractAveraging.supportsInterface(interfaceId);
    }
}
