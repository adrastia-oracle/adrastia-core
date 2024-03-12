// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/adrastia/AdrastiaPriceAccumulator.sol";

contract AdrastiaPriceAccumulatorStub is AdrastiaPriceAccumulator {
    constructor(
        bool validationDisabled_,
        IAveragingStrategy averagingStrategy_,
        address oracleAddress_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AdrastiaPriceAccumulator(
            validationDisabled_,
            averagingStrategy_,
            oracleAddress_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubFetchPrice(address token) public view returns (uint256 price) {
        return super.fetchPrice(abi.encode(token));
    }
}

contract AdrastiaPriceAccumulatorUpdater {
    AdrastiaPriceAccumulator public accumulator;

    constructor(AdrastiaPriceAccumulator accumulator_) {
        accumulator = accumulator_;
    }

    function update(address token) external {
        accumulator.update(abi.encode(token));
    }
}
