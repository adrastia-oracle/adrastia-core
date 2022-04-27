// SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "../interfaces/IAggregatedOracle.sol";
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

contract InterfaceIds {
    function iAggregatedOracle() external pure returns (bytes4) {
        return type(IAggregatedOracle).interfaceId;
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
}
