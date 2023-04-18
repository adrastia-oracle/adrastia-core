// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "../../libraries/ObservationLibrary.sol";

/**
 * @title IValidationStrategy
 * @notice Interface for implementing validation strategies for observation data in a token pair.
 */
interface IValidationStrategy {
    /**
     * @notice Returns the number of decimals of the quote token.
     * @dev This is useful for validations involving prices, which are always expressed in the quote token.
     * @return The number of decimals for the quote token.
     */
    function quoteTokenDecimals() external view returns (uint8);

    /**
     * @notice Validates the given observation data for a token pair.
     * @param observation The observation data to be validated.
     * @return True if the observation passes validation; false otherwise.
     */
    function validateObservation(ObservationLibrary.Observation calldata observation) external view returns (bool);
}
