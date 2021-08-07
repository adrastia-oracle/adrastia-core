//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/ILiquidityStrategy.sol";
import "../libraries/ObservationLibrary.sol";

contract RecentLiquidityStrategy is ILiquidityStrategy {

    function computeLiquidity(ObservationLibrary.Observation[] memory observations) override virtual external view returns(uint256 tokenLiquidity, uint256 baseLiquidity) {
        require(observations.length > 0, "No observations.");

        ObservationLibrary.Observation memory lastObservation = observations[observations.length - 1];

        return (lastObservation.tokenLiquidity, lastObservation.baseLiquidity);
    }

}
