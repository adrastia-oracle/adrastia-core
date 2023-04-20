//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AbstractAggregator.sol";
import "../averaging/IAveragingStrategy.sol";

/**
 * @title MeanAggregator
 * @notice An implementation of IAggregationStrategy that aggregates observations by taking the weighted mean price and
 *   sum of the token and quote token liquidity.
 * @dev Override the extractWeight function to use a custom weight for each observation. The default weight for every
 *   observation is 1.
 */
contract MeanAggregator is AbstractAggregator {
    IAveragingStrategy public immutable averagingStrategy;

    /**
     * @notice Constructor for the MeanAggregator contract.
     * @param averagingStrategy_ The averaging strategy to use for calculating the weighted mean.
     */
    constructor(IAveragingStrategy averagingStrategy_) {
        averagingStrategy = averagingStrategy_;
    }

    /**
     * @notice Aggregates the observations by taking the weighted mean price and the sum of the token and quote token
     *   liquidity.
     * @param observations The observations to aggregate.
     * @param from The index of the first observation to aggregate.
     * @param to The index of the last observation to aggregate.
     * @return observation The aggregated observation with the weighted mean price, the sum of the token and quote token
     *   liquidity, and the current block timestamp.
     */
    function aggregateObservations(
        address,
        ObservationLibrary.MetaObservation[] calldata observations,
        uint256 from,
        uint256 to
    ) external view override returns (ObservationLibrary.Observation memory) {
        if (from > to) revert BadInput();
        uint256 length = observations.length;
        if (length <= to - from) revert InsufficientObservations(observations.length, to - from + 1);
        if (length == 1) {
            ObservationLibrary.Observation memory observation = observations[from].data;
            observation.timestamp = uint32(block.timestamp);
            return observation;
        }

        uint256 weightedSum;
        uint256 sumTokenLiquidity = 0;
        uint256 sumQuoteTokenLiquidity = 0;

        for (uint256 i = from; i <= to; ++i) {
            uint256 weight = extractWeight(observations[i].data);

            weightedSum += averagingStrategy.calculateWeightedValue(observations[i].data.price, weight);

            sumTokenLiquidity += observations[i].data.tokenLiquidity;
            sumQuoteTokenLiquidity += observations[i].data.quoteTokenLiquidity;
        }

        uint256 price = averagingStrategy.calculateWeightedAverage(weightedSum, sumQuoteTokenLiquidity);

        return prepareResult(price, sumTokenLiquidity, sumQuoteTokenLiquidity);
    }

    /**
     * @notice Override this function to provide a custom weight for each observation.
     * @dev The default weight for every observation is 1.
     * @return weight The weight of the provided observation.
     */
    function extractWeight(ObservationLibrary.Observation memory) internal pure virtual returns (uint256) {
        return 1;
    }
}
