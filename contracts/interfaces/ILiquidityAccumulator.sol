//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract ILiquidityAccumulator {

    function quoteToken() virtual external view returns (address);

    function needsUpdate(address token) virtual public view returns(bool);

    function update(address token) virtual external;

    function getAccumulation(address token) virtual public view
        returns(AccumulationLibrary.LiquidityAccumulator memory);

    function getLastObservation(address token) virtual public view
        returns(ObservationLibrary.LiquidityObservation memory);

    function calculateLiquidity(AccumulationLibrary.LiquidityAccumulator memory firstAccumulation, AccumulationLibrary.LiquidityAccumulator memory secondAccumulation) virtual public pure
        returns(uint256 tokenLiquidity, uint256 quoteTokenLiquidity);

}
