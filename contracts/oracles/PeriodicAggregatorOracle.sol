//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AbstractAggregatorOracle.sol";
import "../interfaces/IPeriodic.sol";

contract PeriodicAggregatorOracle is IPeriodic, AbstractAggregatorOracle {
    uint256 public immutable override period;
    uint256 public immutable override granularity;

    uint internal immutable _updateEvery;

    constructor(
        AbstractAggregatorOracleParams memory params,
        uint256 period_,
        uint256 granularity_
    ) AbstractAggregatorOracle(params) {
        require(period_ > 0, "PeriodicAggregatorOracle: INVALID_PERIOD");
        require(granularity_ > 0, "PeriodicAggregatorOracle: INVALID_GRANULARITY");
        require(period_ % granularity_ == 0, "PeriodicAggregatorOracle: INVALID_PERIOD_GRANULARITY");

        period = period_;
        granularity = granularity_;

        _updateEvery = period_ / granularity_;
    }

    /// @inheritdoc AbstractOracle
    function update(bytes memory data) public virtual override returns (bool) {
        if (needsUpdate(data)) return performUpdate(data);

        return false;
    }

    /// @inheritdoc AbstractOracle
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        return timeSinceLastUpdate(data) >= _updateEvery;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IPeriodic).interfaceId || AbstractAggregatorOracle.supportsInterface(interfaceId);
    }

    /**
     * @notice Calculates the maximum age of the underlying oracles' responses when updating this oracle's observation.
     * @dev We use this to prevent old data from skewing our observations. Underlying oracles must update at least as
     *   frequently as this oracle does.
     * @return maxAge The maximum age of underlying oracles' responses, in seconds.
     */
    function calculateMaxAge() internal view override returns (uint256) {
        if (period == 1) {
            // We don't want to subtract 1 from this and use 0 as the max age, because that would cause the oracle
            // to return data straight from the current block, which may not be secure.
            return 1;
        }

        return period - 1; // Subract 1 to ensure that we don't use any data from the previous period
    }
}
