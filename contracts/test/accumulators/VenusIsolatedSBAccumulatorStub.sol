// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/venus/VenusIsolatedSBAccumulator.sol";

contract VenusIsolatedSBAccumulatorStub is VenusIsolatedSBAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address comptroller_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        VenusIsolatedSBAccumulator(
            averagingStrategy_,
            comptroller_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubFetchLiquidity(
        bytes memory data
    ) public view returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        return fetchLiquidity(data);
    }
}
