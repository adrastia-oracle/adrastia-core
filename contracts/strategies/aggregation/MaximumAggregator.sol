// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "./AbstractAggregator.sol";
import "../averaging/IAveragingStrategy.sol";

/**
 * @title MaximumAggregator
 * @notice An implementation of IAggregationStrategy that aggregates observations by taking the maximum price and
 *   sum of the token and quote token liquidity.
 */
contract MaximumAggregator is AbstractAggregator {
    /**
     * @notice Constructs a new MaximumAggregator instance.
     * @param timestampStrategy_ The strategy used to handle timestamps in the aggregated observations.
     */
    constructor(TimestampStrategy timestampStrategy_) AbstractAggregator(timestampStrategy_) {}

    /**
     * @notice Aggregates the observations by taking the maximum price and the sum of the token and quote token
     *   liquidity.
     * @param observations The observations to aggregate.
     * @param from The index of the first observation to aggregate.
     * @param to The index of the last observation to aggregate.
     * @return observation The aggregated observation with the maximum price, the sum of the token and quote token
     *   liquidity, and the current block timestamp.
     * @custom:throws BadInput if the `from` index is greater than the `to` index.
     * @custom:throws InsufficientObservations if the `to` index is greater than the length of the observations array.
     */
    function aggregateObservations(
        address,
        ObservationLibrary.MetaObservation[] calldata observations,
        uint256 from,
        uint256 to
    ) external view override returns (ObservationLibrary.Observation memory) {
        if (from > to) revert BadInput();
        if (observations.length <= to) revert InsufficientObservations(observations.length, to - from + 1);

        uint256 maxPrice = 0;
        uint256 sumTokenLiquidity = 0;
        uint256 sumQuoteTokenLiquidity = 0;

        uint256[] memory timestamps = new uint256[](to - from + 1);

        for (uint256 i = from; i <= to; ++i) {
            uint256 price = observations[i].data.price;
            if (price > maxPrice) {
                maxPrice = price;
            }

            sumTokenLiquidity += observations[i].data.tokenLiquidity;
            sumQuoteTokenLiquidity += observations[i].data.quoteTokenLiquidity;
            timestamps[i - from] = observations[i].data.timestamp;
        }

        return prepareResult(maxPrice, sumTokenLiquidity, sumQuoteTokenLiquidity, calculateFinalTimestamp(timestamps));
    }
}
