//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/IPriceStrategy.sol";
import "../libraries/ObservationLibrary.sol";

contract TwapStrategy is IPriceStrategy {

    using SafeMath for uint256;

    function computePrice(ObservationLibrary.Observation[] memory observations) override virtual external view returns(uint256) {
        require(observations.length > 0, "No observations.");

        uint256 currentTime = block.timestamp;

        uint256 weightedSum = 0;
        uint256 timeSum = 0;

        for (uint256 i = 0; i < observations.length; ++i) {
            uint256 timeElapsed = currentTime.sub(observations[i].timestamp);
            if (timeElapsed == 0)
                timeElapsed = 1;

            weightedSum = weightedSum.add(observations[i].price.mul(timeElapsed));
            timeSum = timeSum.add(timeElapsed);
        }

        return weightedSum.div(timeSum);
    }

}
