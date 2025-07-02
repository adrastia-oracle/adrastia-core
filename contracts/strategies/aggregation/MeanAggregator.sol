// SPDX-License-Identifier: BUSL-1.1
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

    /// @notice An error thrown when the total weight of the observations is zero.
    error ZeroWeight();

    /**
     * @notice Constructor for the MeanAggregator contract.
     * @param averagingStrategy_ The averaging strategy to use for calculating the weighted mean.
     * @param timestampStrategy_ The strategy used to handle timestamps in the aggregated observations.
     */
    constructor(
        IAveragingStrategy averagingStrategy_,
        TimestampStrategy timestampStrategy_
    ) AbstractAggregator(timestampStrategy_) {
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
     * @custom:throws BadInput if the `from` index is greater than the `to` index.
     * @custom:throws InsufficientObservations if the `to` index is greater than the length of the observations array.
     * @custom:throws ZeroWeight if the total weight of the observations is zero.
     */
    function aggregateObservations(
        address,
        ObservationLibrary.MetaObservation[] calldata observations,
        uint256 from,
        uint256 to
    ) external view override returns (ObservationLibrary.Observation memory) {
        if (from > to) revert BadInput();
        if (observations.length <= to) revert InsufficientObservations(observations.length, to - from + 1);

        uint256 sumWeightedPrice;
        uint256 sumWeight;
        uint256 sumTokenLiquidity = 0;
        uint256 sumQuoteTokenLiquidity = 0;

        uint256[] memory timestamps = new uint256[](to - from + 1);

        for (uint256 i = from; i <= to; ++i) {
            uint256 weight = extractWeight(observations[i].data);

            sumWeightedPrice += averagingStrategy.calculateWeightedValue(observations[i].data.price, weight);
            sumWeight += weight;

            sumTokenLiquidity += observations[i].data.tokenLiquidity;
            sumQuoteTokenLiquidity += observations[i].data.quoteTokenLiquidity;
            timestamps[i - from] = observations[i].data.timestamp;
        }

        if (sumWeight == 0) revert ZeroWeight();

        uint256 price = averagingStrategy.calculateWeightedAverage(sumWeightedPrice, sumWeight);

        return prepareResult(price, sumTokenLiquidity, sumQuoteTokenLiquidity, calculateFinalTimestamp(timestamps));
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
