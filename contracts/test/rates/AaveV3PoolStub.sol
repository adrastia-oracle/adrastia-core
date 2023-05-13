// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IAaveV3Pool} from "../../accumulators/proto/aave/AaveV3RateAccumulator.sol";

contract AaveV3PoolStub is IAaveV3Pool {
    ReserveData internal reserveData;

    constructor(uint128 supplyRate_, uint128 variableBorrowRate_, uint128 stableBorrowRate_) {
        reserveData = ReserveData({
            //stores the reserve configuration
            configuration: 0,
            //the liquidity index. Expressed in ray
            liquidityIndex: 0,
            //the current supply rate. Expressed in ray
            currentLiquidityRate: supplyRate_,
            //variable borrow index. Expressed in ray
            variableBorrowIndex: 0,
            //the current variable borrow rate. Expressed in ray
            currentVariableBorrowRate: variableBorrowRate_,
            //the current stable borrow rate. Expressed in ray
            currentStableBorrowRate: stableBorrowRate_,
            //timestamp of last update
            lastUpdateTimestamp: uint40(block.timestamp),
            //the id of the reserve. Represents the position in the list of the active reserves
            id: 0,
            //aToken address
            aTokenAddress: address(0),
            //stableDebtToken address
            stableDebtTokenAddress: address(0),
            //variableDebtToken address
            variableDebtTokenAddress: address(0),
            //address of the interest rate strategy
            interestRateStrategyAddress: address(0),
            //the current treasury balance, scaled
            accruedToTreasury: 0,
            //the outstanding unbacked aTokens minted through the bridging feature
            unbacked: 0,
            //the outstanding debt borrowed against this asset in isolation mode
            isolationModeTotalDebt: 0
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
