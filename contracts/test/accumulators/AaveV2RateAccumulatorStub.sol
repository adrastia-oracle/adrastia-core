// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/aave/AaveV2RateAccumulator.sol";

contract AaveV2RateAccumulatorStub is AaveV2RateAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address aaveV3Pool_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AaveV2RateAccumulator(
            averagingStrategy_,
            aaveV3Pool_,
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
