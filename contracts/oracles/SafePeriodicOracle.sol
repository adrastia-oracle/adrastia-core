//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";

import "../interfaces/IPeriodic.sol";

import "./SafeAbstractOracle.sol";

abstract contract SafePeriodicOracle is IPeriodic, SafeAbstractOracle {
    using LowGasSafeMath for uint256;

    uint256 public immutable override period;

    constructor(address quoteToken_, uint256 period_) SafeAbstractOracle(quoteToken_) {
        period = period_;
    }

    function update(address token) external virtual override returns (bool) {
        if (needsUpdate(token)) return _update(token);

        return false;
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        uint256 deltaTime = block.timestamp.sub(observations[token].timestamp);

        return deltaTime >= period;
    }

    function canUpdate(address token) public view virtual override returns (bool) {
        // If this oracle doesn't need an update, it can't (won't) update
        return needsUpdate(token);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IPeriodic).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(address token) internal virtual returns (bool);
}
