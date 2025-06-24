// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";

import "./IAggregationStrategy.sol";

/**
 * @title AbstractAggregator
 * @notice An abstract contract that implements the IAggregationStrategy interface and provides
 * utility functions for aggregation strategy implementations.
 *
 * This contract should be inherited by custom aggregator implementations that want to leverage
 * the utility functions to validate input parameters and prepare the aggregated result.
 *
 * @dev This contract cannot be deployed directly and should be inherited by another contract.
 * All inheriting contracts must implement the aggregateObservations function as required
 * by the IAggregationStrategy interface.
 */
abstract contract AbstractAggregator is IERC165, IAggregationStrategy {
    TimestampStrategy public immutable timestampStrategy;

    /// @notice An error thrown when the price value exceeds the maximum allowed value for uint112.
    error PriceTooHigh(uint256 price);

    /// @notice An error thrown when the observations array doesn't have enough elements.
    error InsufficientObservations(uint256 provided, uint256 required);

    /// @notice An error thrown when the from index is greater than the to index.
    error BadInput();

    /**
     * @notice An error thrown when no timestamps are provided for aggregation.
     */
    error NoTimestampsProvided();

    /**
     * @notice An error thrown when an unsupported timestamp strategy is provided.
     * @param strategy The unsupported timestamp strategy.
     */
    error InvalidTimestampStrategy(TimestampStrategy strategy);

    /**
     * @notice An error thrown when the timestamp provided is greater than the maximum allowed value for uint32.
     * @param timestamp The timestamp that caused the error.
     */
    error InvalidTimestamp(uint256 timestamp);

    /**
     * @notice Constructor for the AbstractAggregator contract.
     * @param timestampStrategy_ The strategy used to handle timestamps in the aggregated observations.
     */
    constructor(TimestampStrategy timestampStrategy_) {
        validateTimestampStrategy(timestampStrategy_);

        timestampStrategy = timestampStrategy_;
    }

    // @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAggregationStrategy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /**
     * @notice Validates the provided timestamp strategy.
     * @dev This function checks if the provided strategy is one of the supported strategies. Override this and
     * `calculateFinalTimestamp` in derived contracts if you want to support non-standard timestamp strategies.
     * @param strategy The timestamp strategy to validate.
     */
    function validateTimestampStrategy(TimestampStrategy strategy) internal pure virtual {
        if (uint256(strategy) > uint256(TimestampStrategy.LastObservation)) {
            revert InvalidTimestampStrategy(strategy);
        }
    }

    /**
     * @notice Calculates the final timestamp based on the provided timestamps and the configured timestamp strategy.
     * @param timestamps An array of timestamps from which to calculate the final timestamp. The order is expected to be
     * the same as the order of observations.
     * @return The final timestamp based on the configured strategy.
     */
    function calculateFinalTimestamp(uint256[] memory timestamps) internal view virtual returns (uint256) {
        if (timestamps.length == 0) {
            revert NoTimestampsProvided();
        }

        if (timestampStrategy == TimestampStrategy.ThisBlock) {
            return block.timestamp;
        } else if (timestampStrategy == TimestampStrategy.EarliestObservation) {
            uint256 earliestTimestamp = timestamps[0];

            for (uint256 i = 1; i < timestamps.length; ++i) {
                if (timestamps[i] < earliestTimestamp) {
                    earliestTimestamp = timestamps[i];
                }
            }

            return earliestTimestamp;
        } else if (timestampStrategy == TimestampStrategy.LatestObservation) {
            uint256 latestTimestamp = timestamps[0];

            for (uint256 i = 1; i < timestamps.length; ++i) {
                if (timestamps[i] > latestTimestamp) {
                    latestTimestamp = timestamps[i];
                }
            }

            return latestTimestamp;
        } else if (timestampStrategy == TimestampStrategy.FirstObservation) {
            return timestamps[0];
        } else if (timestampStrategy == TimestampStrategy.LastObservation) {
            return timestamps[timestamps.length - 1];
        } else {
            revert InvalidTimestampStrategy(timestampStrategy);
        }
    }

    /**
     * @notice Prepares the aggregated result by validating and converting the calculated
     * price, token liquidity, and quote token liquidity values to their respective types.
     *
     * @dev This function should be called by inheriting contracts after performing any custom
     * aggregation logic to prepare the result for return.
     *
     * @param price The calculated price value.
     * @param tokenLiquidity The calculated token liquidity value.
     * @param quoteTokenLiquidity The calculated quote token liquidity value.
     *
     * @return result An Observation struct containing the aggregated result with the
     * validated price, token liquidity, quote token liquidity, and the current block timestamp.
     */
    function prepareResult(
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity,
        uint256 timestamp
    ) internal pure returns (ObservationLibrary.Observation memory result) {
        if (price > type(uint112).max) {
            revert PriceTooHigh(price);
        } else {
            result.price = uint112(price);
        }
        if (tokenLiquidity > type(uint112).max) {
            result.tokenLiquidity = type(uint112).max; // Cap to max value
        } else {
            result.tokenLiquidity = uint112(tokenLiquidity);
        }
        if (quoteTokenLiquidity > type(uint112).max) {
            result.quoteTokenLiquidity = type(uint112).max; // Cap to max value
        } else {
            result.quoteTokenLiquidity = uint112(quoteTokenLiquidity);
        }

        if (timestamp > type(uint32).max) {
            revert InvalidTimestamp(timestamp);
        }

        result.timestamp = uint32(timestamp);

        return result;
    }
}
