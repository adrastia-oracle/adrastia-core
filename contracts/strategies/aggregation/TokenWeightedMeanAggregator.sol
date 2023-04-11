//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./MeanAggregator.sol";

/**
 * @title TokenWeightedMeanAggregator
 * @notice An implementation of MeanAggregator that uses the token liquidity as weight for each observation.
 * @dev This aggregator calculates the weighted mean price based on the token liquidity of each observation.
 */
contract TokenWeightedMeanAggregator is MeanAggregator {
    /**
     * @notice Constructor for the TokenWeightedMeanAggregator contract.
     * @param averagingStrategy_ The averaging strategy to use for calculating the weighted mean.
     */
    constructor(IAveragingStrategy averagingStrategy_) MeanAggregator(averagingStrategy_) {}

    /**
     * @notice Extracts the weight from the provided observation using the token liquidity.
     * @dev Override this function to use a custom weight for each observation. In this case, the weight is the token
     *   liquidity of the observation.
     * @param observation The observation from which to extract the weight.
     * @return weight The weight of the provided observation, which is the token liquidity.
     */
    function extractWeight(ObservationLibrary.Observation memory observation) internal pure override returns (uint256) {
        return observation.tokenLiquidity;
    }
}
