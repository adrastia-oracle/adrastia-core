//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../libraries/ObservationLibrary.sol";

abstract contract ILiquidityStrategy {

    function computeLiquidity(ObservationLibrary.Observation[] memory observations) virtual external view returns(uint256 tokenLiquidity, uint256 baseLiquidity);

}
