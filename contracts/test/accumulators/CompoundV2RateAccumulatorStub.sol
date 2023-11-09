// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/compound/CompoundV2RateAccumulator.sol";

contract CompoundV2RateAccumulatorStub is CompoundV2RateAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        uint256 blocksPerYear_,
        address cToken_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        CompoundV2RateAccumulator(
            averagingStrategy_,
            blocksPerYear_,
            cToken_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubFetchPrice(bytes memory data) public view returns (uint112 rate) {
        return fetchPrice(data);
    }
}
