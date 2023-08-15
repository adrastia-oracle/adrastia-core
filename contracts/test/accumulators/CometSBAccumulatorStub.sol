// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/compound/CometSBAccumulator.sol";

contract CometSBAccumulatorStub is CometSBAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address comet_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) CometSBAccumulator(averagingStrategy_, comet_, decimals_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function stubFetchLiquidity(
        bytes memory data
    ) public view returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        return fetchLiquidity(data);
    }
}
