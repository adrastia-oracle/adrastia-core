// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/adrastia/AdrastiaUtilizationAndErrorAccumulator.sol";

contract AdrastiaUtilizationAndErrorAccumulatorStub is AdrastiaUtilizationAndErrorAccumulator {
    bool internal targetOverridden;
    uint112 internal targetOverride;

    constructor(
        address supplyAndBorrowOracle_,
        bool considerEmptyAs100Percent_,
        uint112 target_,
        IAveragingStrategy averagingStrategy_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AdrastiaUtilizationAndErrorAccumulator(
            supplyAndBorrowOracle_,
            considerEmptyAs100Percent_,
            target_,
            averagingStrategy_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubSetTarget(bool override_, uint112 target_) external {
        targetOverridden = override_;
        targetOverride = target_;
    }

    function stubFetchValue(address token) public view returns (uint112) {
        return fetchValue(abi.encode(token));
    }

    function stubFetchTarget(address token) public view returns (uint112) {
        return fetchTarget(abi.encode(token));
    }

    function stubFetchLiquidity(address token) public view returns (uint112 value, uint112 err) {
        return fetchLiquidity(abi.encode(token));
    }

    function fetchTarget(bytes memory data) internal view virtual override returns (uint112) {
        if (targetOverridden) {
            return targetOverride;
        }

        return super.fetchTarget(data);
    }
}
