// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";

import "../oracles/IOracleAggregator.sol";
import "../interfaces/IHasLiquidityAccumulator.sol";
import "../interfaces/IHasPriceAccumulator.sol";
import "../interfaces/ILiquidityAccumulator.sol";
import "../interfaces/ILiquidityOracle.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IPeriodic.sol";
import "../interfaces/IPriceAccumulator.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IQuoteToken.sol";
import "../interfaces/IUpdateable.sol";
import "../interfaces/IAccumulator.sol";
import "../interfaces/IHistoricalOracle.sol";
import "../interfaces/IHistoricalPriceAccumulationOracle.sol";
import "../interfaces/IHistoricalLiquidityAccumulationOracle.sol";
import "../strategies/averaging/IAveragingStrategy.sol";
import "../strategies/aggregation/IAggregationStrategy.sol";
import "../strategies/validation/IValidationStrategy.sol";

contract InterfaceIds {
    function iOracleAggregator() external pure returns (bytes4) {
        return type(IOracleAggregator).interfaceId;
    }

    function iHasLiquidityAccumulator() external pure returns (bytes4) {
        return type(IHasLiquidityAccumulator).interfaceId;
    }

    function iHasPriceAccumulator() external pure returns (bytes4) {
        return type(IHasPriceAccumulator).interfaceId;
    }

    function iLiquidityAccumulator() external pure returns (bytes4) {
        return type(ILiquidityAccumulator).interfaceId;
    }

    function iLiquidityOracle() external pure returns (bytes4) {
        return type(ILiquidityOracle).interfaceId;
    }

    function iOracle() external pure returns (bytes4) {
        return type(IOracle).interfaceId;
    }

    function iPeriodic() external pure returns (bytes4) {
        return type(IPeriodic).interfaceId;
    }

    function iPriceAccumulator() external pure returns (bytes4) {
        return type(IPriceAccumulator).interfaceId;
    }

    function iPriceOracle() external pure returns (bytes4) {
        return type(IPriceOracle).interfaceId;
    }

    function iQuoteToken() external pure returns (bytes4) {
        return type(IQuoteToken).interfaceId;
    }

    function iUpdateable() external pure returns (bytes4) {
        return type(IUpdateable).interfaceId;
    }

    function iAccumulator() external pure returns (bytes4) {
        return type(IAccumulator).interfaceId;
    }

    function iHistoricalOracle() external pure returns (bytes4) {
        return type(IHistoricalOracle).interfaceId;
    }

    function iHistoricalPriceAccumulationOracle() external pure returns (bytes4) {
        return type(IHistoricalPriceAccumulationOracle).interfaceId;
    }

    function iHistoricalLiquidityAccumulationOracle() external pure returns (bytes4) {
        return type(IHistoricalLiquidityAccumulationOracle).interfaceId;
    }

    function iERC165() external pure returns (bytes4) {
        return type(IERC165).interfaceId;
    }

    function iAveragingStrategy() external pure returns (bytes4) {
        return type(IAveragingStrategy).interfaceId;
    }

    function iAggregationStrategy() external pure returns (bytes4) {
        return type(IAggregationStrategy).interfaceId;
    }

    function iValidationStrategy() external pure returns (bytes4) {
        return type(IValidationStrategy).interfaceId;
    }

    function invalidInterface() external pure returns (bytes4) {
        return 0xffffffff;
    }
}
