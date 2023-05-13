// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IAaveV2Pool} from "../../accumulators/proto/aave/AaveV2RateAccumulator.sol";

contract AaveV2PoolStub is IAaveV2Pool {
    ReserveData internal reserveData;

    constructor(uint128 supplyRate_, uint128 variableBorrowRate_, uint128 stableBorrowRate_) {
        reserveData = ReserveData({
            //stores the reserve configuration
            configuration: 0,
            //the liquidity index. Expressed in ray
            liquidityIndex: 0,
            //variable borrow index. Expressed in ray
            variableBorrowIndex: 0,
            //the current supply rate. Expressed in ray
            currentLiquidityRate: supplyRate_,
            //the current variable borrow rate. Expressed in ray
            currentVariableBorrowRate: variableBorrowRate_,
            //the current stable borrow rate. Expressed in ray
            currentStableBorrowRate: stableBorrowRate_,
            lastUpdateTimestamp: uint40(block.timestamp),
            //tokens addresses
            aTokenAddress: address(0),
            stableDebtTokenAddress: address(0),
            variableDebtTokenAddress: address(0),
            //address of the interest rate strategy
            interestRateStrategyAddress: address(0),
            //the id of the reserve. Represents the position in the list of the active reserves
            id: 0
        });
    }

    function setSupplyRate(uint128 supplyRate_) external {
        reserveData.currentLiquidityRate = supplyRate_;
    }

    function setBorrowRate(uint128 borrowRate_) external {
        reserveData.currentVariableBorrowRate = borrowRate_;
    }

    function setStableBorrowRate(uint128 stableBorrowRate_) external {
        reserveData.currentStableBorrowRate = stableBorrowRate_;
    }

    function getReserveData(address) public view override returns (ReserveData memory data) {
        return reserveData;
    }
}
