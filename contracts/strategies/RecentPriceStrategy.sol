//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IPriceStrategy.sol";
import "../libraries/ObservationLibrary.sol";

contract RecentPriceStrategy is IPriceStrategy {

    function computePrice(ObservationLibrary.Observation[] memory observations) override virtual external view returns(uint256) {
        require(observations.length > 0, "No observations.");

        return observations[observations.length - 1].price;
    }

}
