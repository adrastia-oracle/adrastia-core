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
    /// @notice An error thrown when the price value exceeds the maximum allowed value for uint112.
    error PriceTooHigh(uint256 price);

    /// @notice An error thrown when the observations array doesn't have enough elements.
    error InsufficientObservations(uint256 provided, uint256 required);

    /// @notice An error thrown when the from index is greater than the to index.
    error BadInput();

    // @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAggregationStrategy).interfaceId || interfaceId == type(IERC165).interfaceId;
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
        uint256 quoteTokenLiquidity
    ) internal view returns (ObservationLibrary.Observation memory result) {
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
        result.timestamp = uint32(block.timestamp);

        return result;
    }
}
