// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../../accumulators/LiquidityAccumulator.sol";

contract LiquidityAccumulatorHarness is LiquidityAccumulator {
    struct MockLiquidity {
        uint256 tokenLiquidity;
        uint256 quoteTokenLiquidity;
    }

    struct Config {
        bool changeThresholdOverridden;
        bool changeThresholdPassed;
        bool needsUpdateOverridden;
        bool needsUpdate;
    }

    mapping(address => MockLiquidity) public mockLiquidity;

    Config public config;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    /* Harness functions */

    function setLiquidity(
        address token,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) public {
        MockLiquidity storage liquidity = mockLiquidity[token];

        liquidity.tokenLiquidity = tokenLiquidity;
        liquidity.quoteTokenLiquidity = quoteTokenLiquidity;
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

    function fetchLiquidity(address token)
        internal
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        MockLiquidity storage liquidity = mockLiquidity[token];

        return (liquidity.tokenLiquidity, liquidity.quoteTokenLiquidity);
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
