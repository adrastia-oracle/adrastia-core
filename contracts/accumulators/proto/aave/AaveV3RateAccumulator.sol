// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

abstract contract IAaveV3Pool {
    struct ReserveData {
        //stores the reserve configuration
        uint256 configuration;
        //the liquidity index. Expressed in ray
        uint128 liquidityIndex;
        //the current supply rate. Expressed in ray
        uint128 currentLiquidityRate;
        //variable borrow index. Expressed in ray
        uint128 variableBorrowIndex;
        //the current variable borrow rate. Expressed in ray
        uint128 currentVariableBorrowRate;
        //the current stable borrow rate. Expressed in ray
        uint128 currentStableBorrowRate;
        //timestamp of last update
        uint40 lastUpdateTimestamp;
        //the id of the reserve. Represents the position in the list of the active reserves
        uint16 id;
        //aToken address
        address aTokenAddress;
        //stableDebtToken address
        address stableDebtTokenAddress;
        //variableDebtToken address
        address variableDebtTokenAddress;
        //address of the interest rate strategy
        address interestRateStrategyAddress;
        //the current treasury balance, scaled
        uint128 accruedToTreasury;
        //the outstanding unbacked aTokens minted through the bridging feature
        uint128 unbacked;
        //the outstanding debt borrowed against this asset in isolation mode
        uint128 isolationModeTotalDebt;
    }

    function getReserveData(address asset) public view virtual returns (ReserveData memory data);
}

contract AaveV3RateAccumulator is PriceAccumulator {
    using SafeCastExt for uint256;

    address public immutable aaveV3Pool;

    error InvalidRateType(uint256 rateType);

    constructor(
        IAveragingStrategy averagingStrategy_,
        address aaveV3Pool_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        aaveV3Pool = aaveV3Pool_;
    }

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112 rate) {
        uint256 rateType = abi.decode(data, (uint256));

        IAaveV3Pool.ReserveData memory reserveData = IAaveV3Pool(aaveV3Pool).getReserveData(quoteTokenAddress());

        if (rateType == 1) {
            rate = uint112(reserveData.currentLiquidityRate);
        } else if (rateType == 2) {
            rate = uint112(reserveData.currentVariableBorrowRate);
        } else if (rateType == 3) {
            rate = uint112(reserveData.currentStableBorrowRate);
        } else {
            revert InvalidRateType(rateType);
        }

        // Convert from ray to 1e18 = 100%
        rate /= 1e9;
    }
}
