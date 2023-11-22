// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../LiquidityAccumulator.sol";
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

contract AaveV3SBAccumulator is LiquidityAccumulator {
    using SafeCastExt for uint256;

    address public immutable aaveV3Pool;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address aaveV3Pool_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, address(0), updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        aaveV3Pool = aaveV3Pool_;

        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));
        IAaveV3Pool.ReserveData memory reserveData = IAaveV3Pool(aaveV3Pool).getReserveData(token);

        uint256 supply = IERC20(reserveData.aTokenAddress).totalSupply();
        uint256 stableDebt = IERC20(reserveData.stableDebtTokenAddress).totalSupply();
        uint256 variableDebt = IERC20(reserveData.variableDebtTokenAddress).totalSupply();
        uint256 totalDebt = stableDebt + variableDebt;

        uint256 tokenDecimalsFactor = 10 ** IERC20Metadata(token).decimals();

        tokenLiquidity = ((totalDebt * _decimalFactor) / tokenDecimalsFactor).toUint112();
        quoteTokenLiquidity = ((supply * _decimalFactor) / tokenDecimalsFactor).toUint112();
    }
}
