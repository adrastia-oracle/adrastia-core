// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/balancer/BalancerV2LiquidityAccumulator.sol";

contract BalancerV2LiquidityAccumulatorStub is BalancerV2LiquidityAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address balancerVault_,
        bytes32 poolId_,
        address quoteToken_,
        uint8 liquidityDecimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        BalancerV2LiquidityAccumulator(
            averagingStrategy_,
            balancerVault_,
            poolId_,
            quoteToken_,
            liquidityDecimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubFetchLiquidity(address token) external view returns (uint112, uint112) {
        return fetchLiquidity(abi.encode(token));
    }
}
