//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../strategies/averaging/HarmonicAveragingWS140.sol";
import "../strategies/aggregation/QuoteTokenWeightedMeanAggregator.sol";

contract DefaultAggregator is QuoteTokenWeightedMeanAggregator, HarmonicAveragingWS140 {
    constructor() QuoteTokenWeightedMeanAggregator(this) {}
}
