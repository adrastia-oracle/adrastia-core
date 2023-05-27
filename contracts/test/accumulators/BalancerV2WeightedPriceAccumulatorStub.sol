// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/balancer/BalancerV2WeightedPriceAccumulator.sol";

contract BalancerV2WeightedPriceAccumulatorStub is BalancerV2WeightedPriceAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address balancerVault_,
        bytes32 poolId_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        BalancerV2WeightedPriceAccumulator(
            averagingStrategy_,
            balancerVault_,
            poolId_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubFetchPrice(address token) external view returns (uint112) {
        return fetchPrice(abi.encode(token));
    }
}
