// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/venus/VenusSBAccumulator.sol";

contract VenusSBAccumulatorStub is VenusSBAccumulator {
    bool internal stubSupportsBadDebt;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address comptroller_,
        bool supportsBadDebt_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        VenusSBAccumulator(
            averagingStrategy_,
            comptroller_,
            supportsBadDebt_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {
        stubSupportsBadDebt = supportsBadDebt_;
    }

    function stubSetSupportsBadDebt(bool supportsBadDebt_) public {
        stubSupportsBadDebt = supportsBadDebt_;
    }

    function supportsBadDebt() public view override returns (bool) {
        return stubSupportsBadDebt;
    }

    function stubFetchLiquidity(
        bytes memory data
    ) public view returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        return fetchLiquidity(data);
    }
}
