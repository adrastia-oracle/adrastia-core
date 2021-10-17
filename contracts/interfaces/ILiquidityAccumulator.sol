//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

pragma experimental ABIEncoderV2;

import "./IUpdateByToken.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract ILiquidityAccumulator is IUpdateByToken {
    function quoteToken() external view virtual returns (address);

    function changePrecisionDecimals() external view virtual returns (uint256);

    function getLastAccumulation(address token)
        public
        view
        virtual
        returns (AccumulationLibrary.LiquidityAccumulator memory);

    function getLastObservation(address token)
        public
        view
        virtual
        returns (ObservationLibrary.LiquidityObservation memory);

    function calculateLiquidity(
        AccumulationLibrary.LiquidityAccumulator memory firstAccumulation,
        AccumulationLibrary.LiquidityAccumulator memory secondAccumulation
    ) public pure virtual returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity);
}
