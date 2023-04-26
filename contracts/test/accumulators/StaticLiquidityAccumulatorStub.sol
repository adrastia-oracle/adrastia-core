// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/static/StaticLiquidityAccumulator.sol";

contract StaticLiquidityAccumulatorStub is StaticLiquidityAccumulator {
    constructor(
        address quoteToken_,
        uint8 decimals_,
        uint112 tokenLiquidity_,
        uint112 quoteTokenLiquidity_
    ) StaticLiquidityAccumulator(quoteToken_, decimals_, tokenLiquidity_, quoteTokenLiquidity_) {}

    function stubFetchLiquidity(bytes memory updateData) public view returns (uint112, uint112) {
        return fetchLiquidity(updateData);
    }
}
