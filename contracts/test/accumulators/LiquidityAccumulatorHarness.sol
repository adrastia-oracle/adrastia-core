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

    /* Overridden functions */

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
        uint256 updateTheshold
    ) internal view virtual override returns (bool) {
        if (config.changeThresholdOverridden) return config.changeThresholdPassed;
        else return super.changeThresholdSurpassed(a, b, updateTheshold);
    }
}
