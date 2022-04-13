//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "../interfaces/IPeriodic.sol";

import "./AbstractOracle.sol";

abstract contract PeriodicOracle is IPeriodic, AbstractOracle {
    uint256 public immutable override period;

    constructor(address quoteToken_, uint256 period_) AbstractOracle(quoteToken_) {
        period = period_;
    }

    /// @inheritdoc AbstractOracle
    function update(address token) external virtual override returns (bool) {
        if (needsUpdate(token)) return _update(token);

        return false;
    }

    /// @inheritdoc AbstractOracle
    function needsUpdate(address token) public view virtual override returns (bool) {
        uint256 deltaTime = block.timestamp - observations[token].timestamp;

        return deltaTime >= period;
    }

    /// @inheritdoc AbstractOracle
    function canUpdate(address token) public view virtual override returns (bool) {
        // If this oracle doesn't need an update, it can't (won't) update
        return needsUpdate(token);
    }

    /// @inheritdoc AbstractOracle
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IPeriodic).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(address token) internal virtual returns (bool);
}
