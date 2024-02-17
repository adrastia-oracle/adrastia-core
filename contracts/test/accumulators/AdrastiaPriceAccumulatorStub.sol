// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/adrastia/AdrastiaPriceAccumulator.sol";

contract AdrastiaPriceAccumulatorStub is AdrastiaPriceAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address oracleAddress_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) AdrastiaPriceAccumulator(averagingStrategy_, oracleAddress_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function stubFetchPrice(address token) public view returns (uint256 price) {
        return super.fetchPrice(abi.encode(token));
    }

    function validateObservation(bytes memory, uint112) internal virtual override returns (bool) {
        return true; // Disable for simplicity
    }
}
