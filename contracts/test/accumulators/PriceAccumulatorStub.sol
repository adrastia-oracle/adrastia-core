// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../../accumulators/PriceAccumulator.sol";

contract PriceAccumulatorStub is PriceAccumulator {
    struct Config {
        bool changeThresholdOverridden;
        bool changeThresholdPassed;
        bool needsUpdateOverridden;
        bool needsUpdate;
    }

    mapping(address => uint256) public mockPrices;

    Config public config;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    /* Stub functions */

    function setPrice(address token, uint256 price) public {
        mockPrices[token] = price;
    }

    function overrideChangeThresholdPassed(bool overridden, bool changeThresholdPassed) public {
        config.changeThresholdOverridden = overridden;
        config.changeThresholdPassed = changeThresholdPassed;
    }

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    function harnessChangeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateThreshold
    ) public view returns (bool) {
        return changeThresholdSurpassed(a, b, updateThreshold);
    }

    /* Overridden functions */

    function needsUpdate(address token) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(token);
    }

    function fetchPrice(address token) internal view virtual override returns (uint256) {
        return mockPrices[token];
    }

    function changeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateThreshold
    ) internal view virtual override returns (bool) {
        if (config.changeThresholdOverridden) return config.changeThresholdPassed;
        else return super.changeThresholdSurpassed(a, b, updateThreshold);
    }
}
