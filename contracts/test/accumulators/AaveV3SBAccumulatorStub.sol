// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/aave/AaveV3SBAccumulator.sol";

contract AaveV3SBAccumulatorStub is AaveV3SBAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address aaveV3Pool_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AaveV3SBAccumulator(
            averagingStrategy_,
            aaveV3Pool_,
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
