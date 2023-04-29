//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AbstractAggregator.sol";

/**
 * @title MedianAggregator
 * @notice An implementation of IAggregationStrategy that aggregates observations by taking the median price and the
 * sum of the token and quote token liquidity.
 *
 * This contract extends the AbstractAggregator and overrides the aggregateObservations function to perform
 * median-based aggregation.
 */
contract MedianAggregator is AbstractAggregator {
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

        quickSort(prices, 0, int256(length - 1));

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

    /**
     * @notice Sorts the array of prices using the quick sort algorithm.
     *
     * @dev This function is used internally by the aggregateObservations function.
     *
     * @param prices The array of prices to sort.
     * @param left The left boundary of the sorting range.
     * @param right The right boundary of the sorting range.
     */
    function quickSort(uint112[] memory prices, int256 left, int256 right) internal pure {
        if (right - left <= 10) {
            insertionSort(prices, left, right);
            return;
        }

        int256 i = left;
        int256 j = right;
        if (i == j) return;

        uint256 pivotIndex = uint256(left + (right - left) / 2);
        uint256 pivotPrice = prices[pivotIndex];

        while (i <= j) {
            while (prices[uint256(i)] < pivotPrice) {
                i = i + 1;
            }
            while (pivotPrice < prices[uint256(j)]) {
                j = j - 1;
            }
            if (i <= j) {
                (prices[uint256(i)], prices[uint256(j)]) = (prices[uint256(j)], prices[uint256(i)]);
                i = i + 1;
                j = j - 1;
            }
        }

        if (left < j) {
            quickSort(prices, left, j);
        }
        if (i < right) {
            quickSort(prices, i, right);
        }
    }

    /**
     * @notice Sorts the array of prices using the insertion sort algorithm.
     *
     * @dev This function is used internally by the quickSort function for smaller sorting ranges.
     *
     * @param prices The array of prices to sort.
     * @param left The left boundary of the sorting range.
     * @param right The right boundary of the sorting range.
     */
    function insertionSort(uint112[] memory prices, int256 left, int256 right) internal pure {
        for (int256 i = left + 1; i <= right; i = i + 1) {
            uint112 key = prices[uint256(i)];
            int256 j = i - 1;

            while (j >= left && prices[uint256(j)] > key) {
                prices[uint256(j + 1)] = prices[uint256(j)];
                j = j - 1;
            }
            prices[uint256(j + 1)] = key;
        }
    }
}
