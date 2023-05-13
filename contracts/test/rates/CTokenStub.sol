// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {ICToken} from "../../accumulators/proto/compound/CompoundV2RateAccumulator.sol";

contract CTokenStub is ICToken {
    uint256 public supplyRate;
    uint256 public borrowRate;

    constructor(uint256 supplyRate_, uint256 borrowRate_) {
        supplyRate = supplyRate_;
        borrowRate = borrowRate_;
    }

    function setSupplyRate(uint256 rate) external {
        supplyRate = rate;
    }

    function setBorrowRate(uint256 rate) external {
        borrowRate = rate;
    }

    function supplyRatePerBlock() external view override returns (uint256) {
        return supplyRate;
    }

    function borrowRatePerBlock() external view override returns (uint256) {
        return borrowRate;
    }
}
