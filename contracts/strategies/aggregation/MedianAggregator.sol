// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "./AbstractAggregator.sol";
import "../../libraries/SortingLibrary.sol";

/**
 * @title MedianAggregator
 * @notice An implementation of IAggregationStrategy that aggregates observations by taking the median price and the
 * sum of the token and quote token liquidity.
 *
 * This contract extends the AbstractAggregator and overrides the aggregateObservations function to perform
 * median-based aggregation.
 */
contract MedianAggregator is AbstractAggregator {
    using SortingLibrary for uint112[];

    /**
     * @notice Aggregates the observations by taking the median price and the sum of the token and quote token
     * liquidity.
     *
     * @param observations The observations to aggregate.
     * @param from The index of the first observation to aggregate.
     * @param to The index of the last observation to aggregate.
     *
     * @return observation The aggregated observation with the median price, the sum of the token and quote token
     * liquidity, and the current block timestamp.
     */
    function aggregateObservations(
        address,
        ObservationLibrary.MetaObservation[] calldata observations,
        uint256 from,
        uint256 to
    ) external view override returns (ObservationLibrary.Observation memory) {
        if (from > to) revert BadInput();
        if (observations.length <= to) revert InsufficientObservations(observations.length, to - from + 1);
        uint256 length = to - from + 1;
        if (length == 1) {
            ObservationLibrary.Observation memory observation = observations[from].data;
            observation.timestamp = uint32(block.timestamp);
            return observation;
        }

        uint112[] memory prices = new uint112[](length);
        uint256 sumTokenLiquidity = 0;
        uint256 sumQuoteTokenLiquidity = 0;

        for (uint256 i = from; i <= to; ++i) {
            prices[i] = observations[i].data.price;

            sumTokenLiquidity += observations[i].data.tokenLiquidity;
            sumQuoteTokenLiquidity += observations[i].data.quoteTokenLiquidity;
        }

        prices.quickSort(0, int256(length - 1));

        // Take the median price
        uint256 medianIndex = length / 2;
        uint112 medianPrice;
        if (length % 2 == 0) {
            // Casting to uint112 because the average of two uint112s cannot overflow a uint112
            medianPrice = uint112((uint256(prices[medianIndex - 1]) + uint256(prices[medianIndex])) / 2);
        } else {
            medianPrice = prices[medianIndex];
        }

        return prepareResult(medianPrice, sumTokenLiquidity, sumQuoteTokenLiquidity);
    }
}
