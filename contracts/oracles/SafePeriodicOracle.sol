//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";

import "./SafeAbstractOracle.sol";

abstract contract SafePeriodicOracle is SafeAbstractOracle {
    using LowGasSafeMath for uint256;

    uint256 public immutable period;

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

    function _update(address token) internal virtual returns (bool);
}
