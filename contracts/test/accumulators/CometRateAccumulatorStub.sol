// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/compound/CometRateAccumulator.sol";

contract CometRateAccumulatorStub is CometRateAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address comet_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) CometRateAccumulator(averagingStrategy_, comet_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function stubFetchPrice(bytes memory data) public view returns (uint112 rate) {
        return fetchPrice(data);
    }
}
