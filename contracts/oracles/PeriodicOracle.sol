//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "./AbstractOracle.sol";

abstract contract PeriodicOracle is AbstractOracle {
    uint256 public immutable period;

    constructor(address quoteToken_, uint256 period_) AbstractOracle(quoteToken_) {
        period = period_;
    }

    function update(address token) external virtual override returns (bool) {
        if (needsUpdate(token)) return _update(token);

        return false;
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        uint256 deltaTime = block.timestamp - observations[token].timestamp;

        return deltaTime >= period;
    }

    function _update(address token) internal virtual returns (bool);
}
