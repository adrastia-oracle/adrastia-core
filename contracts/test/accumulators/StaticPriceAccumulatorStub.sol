// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/static/StaticPriceAccumulator.sol";

contract StaticPriceAccumulatorStub is StaticPriceAccumulator {
    constructor(address quoteToken_, uint112 price_) StaticPriceAccumulator(quoteToken_, price_) {}

    function stubFetchPrice(bytes memory updateData) public view returns (uint112) {
        return fetchPrice(updateData);
    }
}
