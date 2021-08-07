//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/ILiquidityStrategy.sol";
import "../libraries/ObservationLibrary.sol";

contract TwalStrategy is ILiquidityStrategy {

    using SafeMath for uint256;

    function computeLiquidity(ObservationLibrary.Observation[] memory observations) override virtual external view returns(uint256 tokenLiquidity, uint256 baseLiquidity) {
        require(observations.length > 0, "No observations.");

        uint256 currentTime = block.timestamp;

        uint256 weightedTokenSum = 0;
        uint256 weightedBaseSum = 0;

        uint256 timeSum = 0;

        for (uint256 i = 0; i < observations.length; ++i) {
            uint256 timeElapsed = currentTime.sub(observations[i].timestamp);
            if (timeElapsed == 0)
                timeElapsed = 1;

            weightedTokenSum = weightedTokenSum.add(observations[i].tokenLiquidity.mul(timeElapsed));
            weightedBaseSum = weightedBaseSum.add(observations[i].baseLiquidity.mul(timeElapsed));
            timeSum = timeSum.add(timeElapsed);
        }

        return (weightedTokenSum.div(timeSum), weightedBaseSum.div(timeSum));
    }

}
