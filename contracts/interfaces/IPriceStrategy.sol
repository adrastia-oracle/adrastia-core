//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../libraries/ObservationLibrary.sol";

abstract contract IPriceStrategy {

    function computePrice(ObservationLibrary.Observation[] memory observations) virtual external view returns(uint256);

}
