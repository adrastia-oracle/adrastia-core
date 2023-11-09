// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../interfaces/IPeriodic.sol";

import "./AbstractOracle.sol";

abstract contract PeriodicOracle is IPeriodic, AbstractOracle {
    uint256 public immutable override period;
    uint256 public immutable override granularity;

    uint internal immutable _updateEvery;

    constructor(address quoteToken_, uint256 period_, uint256 granularity_) AbstractOracle(quoteToken_) {
        require(period_ > 0, "PeriodicOracle: INVALID_PERIOD");
        require(granularity_ > 0, "PeriodicOracle: INVALID_GRANULARITY");
        require(period_ % granularity_ == 0, "PeriodicOracle: INVALID_PERIOD_GRANULARITY");

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

    /// @inheritdoc AbstractOracle
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        // If this oracle doesn't need an update, it can't (won't) update
        return needsUpdate(data);
    }

    /// @inheritdoc AbstractOracle
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IPeriodic).interfaceId || super.supportsInterface(interfaceId);
    }

    function performUpdate(bytes memory data) internal virtual returns (bool);
}
