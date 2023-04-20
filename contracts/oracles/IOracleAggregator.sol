//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

pragma experimental ABIEncoderV2;

import "../strategies/aggregation/IAggregationStrategy.sol";
import "../strategies/validation/IValidationStrategy.sol";

/**
 * @title IOracleAggregator
 * @notice This interface defines the functions for an aggregator oracle. An aggregator oracle collects and processes
 * data from multiple underlying oracles to provide a single source of truth that is accurate and reliable.
 */
interface IOracleAggregator {
    /**
     * @dev Struct representing an individual oracle.
     * Contains the following properties:
     * - oracle: The address of the oracle (160 bits)
     * - priceDecimals: The number of decimals in the oracle's price data
     * - liquidityDecimals: The number of decimals in the oracle's liquidity data
     */
    struct Oracle {
        address oracle; // The oracle address, 160 bits
        uint8 priceDecimals; // The number of decimals of the price
        uint8 liquidityDecimals; // The number of decimals of the liquidity
    }

    /**
     * @notice Returns the aggregation strategy being used by the aggregator oracle.
     * @return strategy The instance of the IAggregationStrategy being used.
     */
    function aggregationStrategy() external view returns (IAggregationStrategy strategy);

    /**
     * @notice Returns the validation strategy being used by the aggregator oracle.
     * @dev The validation strategy is used to validate the data from the underlying oracles before it is aggregated.
     * Results from the underlying oracles that do not pass validation will be ignored.
     * @return strategy The instance of the IValidationStrategy being used, or the zero address if no validation
     * strategy is being used.
     */
    function validationStrategy() external view returns (IValidationStrategy strategy);

    /**
     * @notice Returns an array of Oracle structs representing the underlying oracles for a given token.
     * @param token The address of the token for which oracles are being requested.
     * @return oracles An array of Oracle structs for the given token.
     */
    function getOracles(address token) external view returns (Oracle[] memory oracles);

    /**
     * @notice Returns the minimum number of oracle responses required for the aggregator to push a new observation.
     * @param token The address of the token for which the minimum number of responses is being requested.
     * @return minimumResponses The minimum number of responses required.
     */
    function minimumResponses(address token) external view returns (uint256 minimumResponses);

    /**
     * @notice Returns the maximum age (in seconds) of an underlying oracle response for it to be considered valid.
     * @dev The maximum response age is used to prevent stale data from being aggregated.
     * @param token The address of the token for which the maximum response age is being requested.
     * @return maximumResponseAge The maximum response age in seconds.
     */
    function maximumResponseAge(address token) external view returns (uint256 maximumResponseAge);
}
