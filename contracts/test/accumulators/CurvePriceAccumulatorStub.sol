//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "../../accumulators/proto/curve/CurvePriceAccumulator.sol";

contract CurvePriceAccumulatorStub is CurvePriceAccumulator {
    constructor(
        address pool_,
        int8 nCoins_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) CurvePriceAccumulator(pool_, nCoins_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function harnessFetchPrice(address token) public view returns (uint256 price) {
        return super.fetchPrice(token);
    }
}
