// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

abstract contract IAaveV2Pool {
    struct ReserveData {
        //stores the reserve configuration
        uint256 configuration;
        //the liquidity index. Expressed in ray
        uint128 liquidityIndex;
        //variable borrow index. Expressed in ray
        uint128 variableBorrowIndex;
        //the current supply rate. Expressed in ray
        uint128 currentLiquidityRate;
        //the current variable borrow rate. Expressed in ray
        uint128 currentVariableBorrowRate;
        //the current stable borrow rate. Expressed in ray
        uint128 currentStableBorrowRate;
        uint40 lastUpdateTimestamp;
        //tokens addresses
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        //address of the interest rate strategy
        address interestRateStrategyAddress;
        //the id of the reserve. Represents the position in the list of the active reserves
        uint8 id;
    }

    function getReserveData(address asset) public view virtual returns (ReserveData memory data);
}

contract AaveV2RateAccumulator is PriceAccumulator {
    using SafeCastExt for uint256;

    address public immutable aaveV2Pool;

    error InvalidRateType(uint256 rateType);

    constructor(
        IAveragingStrategy averagingStrategy_,
        address aaveV2Pool_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        aaveV2Pool = aaveV2Pool_;
    }

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112 rate) {
        uint256 rateType = abi.decode(data, (uint256));

        IAaveV2Pool.ReserveData memory reserveData = IAaveV2Pool(aaveV2Pool).getReserveData(quoteTokenAddress());

        if (rateType == 16) {
            rate = uint112(reserveData.currentLiquidityRate);
        } else if (rateType == 17) {
            rate = uint112(reserveData.currentVariableBorrowRate);
        } else if (rateType == 18) {
            rate = uint112(reserveData.currentStableBorrowRate);
        } else {
            revert InvalidRateType(rateType);
        }

        // Convert from ray to 1e18 = 100%
        rate /= 1e9;
    }
}
