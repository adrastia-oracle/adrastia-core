// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IComet} from "../../accumulators/proto/compound/CometRateAccumulator.sol";

contract CometStub is IComet {
    uint256 public utilization;
    uint64 public supplyRate;
    uint64 public borrowRate;

    address public override baseToken;

    constructor(address baseToken_, uint256 utilization_, uint64 supplyRate_, uint64 borrowRate_) {
        baseToken = baseToken_;
        utilization = utilization_;
        supplyRate = supplyRate_;
        borrowRate = borrowRate_;
    }

    function setSupplyRate(uint64 rate) external {
        supplyRate = rate;
    }

    function setBorrowRate(uint64 rate) external {
        borrowRate = rate;
    }

    function setUtilization(uint256 utilization_) external {
        utilization = utilization_;
    }

    function getSupplyRate(uint256) public view override returns (uint64) {
        return supplyRate;
    }

    function getBorrowRate(uint256) public view override returns (uint64) {
        return borrowRate;
    }

    function getUtilization() public view override returns (uint256) {
        return utilization;
    }
}
