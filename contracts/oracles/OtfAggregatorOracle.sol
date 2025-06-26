// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "./AbstractAggregatorOracle.sol";

/**
 * @title On-The-Fly Aggregator Oracle (OtfAggregatorOracle)
 * @notice An aggregator oracle that performs aggregation on-the-fly without storing observations.
 */
contract OtfAggregatorOracle is AbstractAggregatorOracle {
    /**
     * @notice The minimum freshness of the aggregated observations. The age of the underlying oracles' responses must
     * be less than or equal to this value for the data to be considered valid.
     * @dev This value is passed to the underlying oracles when performing consultations.
     */
    uint256 internal immutable _minimumFreshness;

    /**
     * @notice The minimum number of valid responses required for the aggregation to be considered valid.
     */
    uint256 internal immutable _minResponses;

    /**
     * @notice An error thrown when the minimum freshness is invalid.
     * @param providedMinFreshness The provided minimum freshness that caused the error.
     * @param minFreshness The minimum freshness that is required.
     */
    error InvalidMinimumFreshness(uint256 providedMinFreshness, uint256 minFreshness);

    /**
     * @notice An error thrown when the minimum number of responses is invalid.
     * @param providedMinResponses The provided minimum number of responses that caused the error.
     * @param minResponses The minimum number of responses that is required.
     */
    error InvalidMinimumResponses(uint256 providedMinResponses, uint256 minResponses);

    constructor(
        AbstractAggregatorOracleParams memory params,
        uint256 minimumFreshness_,
        uint256 minResponses_
    ) AbstractAggregatorOracle(params) {
        _validateMinimumFreshness(minimumFreshness_);
        // Note: We choose not to validate the min responses against the provided oracles, as the existance of
        // token-specific oracles can make expectations unclear.
        _validateMinimumResponses(minResponses_);
        _minimumFreshness = minimumFreshness_;
        _minResponses = minResponses_;
    }

    function getLatestObservation(
        address token
    ) public view virtual override returns (ObservationLibrary.Observation memory observation) {
        uint256 validResponses;
        (observation, validResponses) = aggregateUnderlying(token, _maximumResponseAge(token));

        uint256 minResponses = _minimumResponses(token);
        require(validResponses >= minResponses, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");
    }

    /// @notice Not supported.
    function update(bytes memory) public virtual override returns (bool) {
        revert("Not supported");
    }

    /// @notice Always returns false, as this oracle does not store observations and does not need to be updated.
    function needsUpdate(bytes memory) public pure virtual override returns (bool) {
        return false;
    }

    /// @notice Not supported.
    function getObservationAt(
        address,
        uint256
    ) external pure virtual override returns (ObservationLibrary.Observation memory) {
        revert("Not supported");
    }

    /// @notice Not supported.
    function getObservations(
        address,
        uint256
    ) external pure virtual override returns (ObservationLibrary.Observation[] memory) {
        revert("Not supported");
    }

    /// @notice Not supported.
    function getObservations(
        address,
        uint256,
        uint256,
        uint256
    ) external pure virtual override returns (ObservationLibrary.Observation[] memory) {
        revert("Not supported");
    }

    /// @notice Not supported.
    function getObservationsCount(address) external pure override returns (uint256) {
        revert("Not supported");
    }

    /// @notice Not supported.
    function getObservationsCapacity(address) external pure virtual override returns (uint256) {
        revert("Not supported");
    }

    /// @notice Not supported.
    function setObservationsCapacity(address, uint256) external virtual override {
        revert("Not supported");
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AbstractAggregatorOracle) returns (bool) {
        return AbstractAggregatorOracle.supportsInterface(interfaceId);
    }

    function _validateMinimumFreshness(uint256 minimumFreshness_) internal pure virtual {
        if (minimumFreshness_ == 0) {
            revert InvalidMinimumFreshness(minimumFreshness_, 1);
        }
    }

    function _validateMinimumResponses(uint256 minResponses_) internal pure virtual {
        if (minResponses_ == 0) {
            revert InvalidMinimumResponses(minResponses_, 1);
        }
    }

    function _minimumResponses(address) internal view virtual override returns (uint256) {
        return _minResponses;
    }

    function _maximumResponseAge(address) internal view virtual override returns (uint256) {
        return _minimumFreshness;
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
