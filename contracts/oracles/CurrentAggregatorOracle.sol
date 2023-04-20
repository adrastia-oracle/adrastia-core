//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AbstractAggregatorOracle.sol";
import "../accumulators/AbstractAccumulator.sol";

/**
 * @title CurrentAggregatorOracle
 * @notice An aggregator oracle that updates when the price changes by a certain threshold.
 * @dev This oracle doesn't update the underlying oracles, so ensure that the underlying oracles are kept up-to-date.
 */
contract CurrentAggregatorOracle is AbstractAccumulator, AbstractAggregatorOracle {
    /// @notice The minimum delay between updates, in seconds.
    uint256 internal immutable minUpdateDelay;

    /// @notice The (optimistic) maximum delay between updates, in seconds.
    uint256 internal immutable maxUpdateDelay;

    /// @notice An error that is thrown when the minimum update delay is greater than the maximum update delay.
    /// @param minUpdateDelay The minimum update delay.
    /// @param maxUpdateDelay The maximum update delay.
    error InvalidUpdateDelays(uint256 minUpdateDelay, uint256 maxUpdateDelay);

    /**
     * @notice Constructor for the CurrentAggregatorOracle contract.
     * @param params The parameters for the abstract aggregator oracle.
     * @param updateThreshold_ The threshold for the price change that triggers an update. The threshold is expressed as
     * a percentage of the current price and scaled by AbstractAccumulator#changePrecision.
     * @param minUpdateDelay_ The minimum delay between updates, in seconds.
     * @param maxUpdateDelay_ The (optimistic) maximum delay between updates, in seconds. Also known as the heartbeat.
     */
    constructor(
        AbstractAggregatorOracleParams memory params,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) AbstractAggregatorOracle(params) AbstractAccumulator(updateThreshold_) {
        if (maxUpdateDelay_ < minUpdateDelay_) revert InvalidUpdateDelays(minUpdateDelay_, maxUpdateDelay_);

        minUpdateDelay = minUpdateDelay_;
        maxUpdateDelay = maxUpdateDelay_;
    }

    /// @inheritdoc IAccumulator
    function updateDelay() external view virtual override returns (uint256) {
        return minUpdateDelay;
    }

    /// @inheritdoc IAccumulator
    function heartbeat() external view virtual override returns (uint256) {
        return maxUpdateDelay;
    }

    /// @inheritdoc AbstractOracle
    function update(bytes memory data) public virtual override returns (bool) {
        if (needsUpdate(data)) return performUpdate(data);

        return false;
    }

    /// @inheritdoc IAccumulator
    function changeThresholdSurpassed(
        bytes memory data,
        uint256 changeThreshold
    ) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));
        uint256 maxAge = _maximumResponseAge(token);
        (ObservationLibrary.Observation memory currentObservation, uint256 responses) = aggregateUnderlying(
            token,
            maxAge
        );

        uint256 requiredResponses = _minimumResponses(token);
        if (responses < requiredResponses) {
            // Not enough responses to update
            return false;
        }

        ObservationLibrary.Observation memory lastObservation = getLatestObservation(token);

        return changeThresholdSurpassed(currentObservation.price, lastObservation.price, changeThreshold);
    }

    /**
     * @notice Checks whether the oracle needs to be updated.
     * @dev This oracle needs to be updated if the price change threshold is surpassed or if the time since the last
     * update has exceeded the maximum update delay.
     * @param data The encoded token address.
     * @return True if the oracle needs to be updated, false otherwise.
     */
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        uint256 deltaTime = timeSinceLastUpdate(data);
        if (deltaTime < minUpdateDelay) {
            // Ensures updates occur at most once every minUpdateDelay (seconds)
            return false;
        } else if (deltaTime >= maxUpdateDelay) {
            // Ensures updates occur (optimistically) at least once every maxUpdateDelay (seconds)
            return true;
        }

        return updateThresholdSurpassed(data);
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AbstractAccumulator, AbstractAggregatorOracle) returns (bool) {
        return
            AbstractAccumulator.supportsInterface(interfaceId) ||
            AbstractAggregatorOracle.supportsInterface(interfaceId);
    }

    function _minimumResponses(address) internal view virtual override returns (uint256) {
        return 1;
    }

    function _maximumResponseAge(address) internal view virtual override returns (uint256) {
        return maxUpdateDelay + 30 minutes;
    }

    /// @inheritdoc AbstractAggregatorOracle
    /// @dev This oracle won't update its underlying oracles.
    function canUpdateUnderlyingOracles(bytes memory) internal view virtual override returns (bool) {
        return false;
    }

    /// @inheritdoc AbstractAggregatorOracle
    /// @dev This oracle won't update its underlying oracles.
    function updateUnderlyingOracles(bytes memory) internal virtual override returns (bool) {
        return false;
    }
}
