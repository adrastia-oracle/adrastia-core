// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../../accumulators/LiquidityAccumulator.sol";

contract LiquidityAccumulatorStub is LiquidityAccumulator {
    struct MockLiquidity {
        uint112 tokenLiquidity;
        uint112 quoteTokenLiquidity;
    }

    struct Config {
        bool changeThresholdOverridden;
        bool changeThresholdPassed;
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool validateObservationOverridden;
        bool validateObservation;
    }

    mapping(address => MockLiquidity) public mockLiquidity;

    Config public config;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    /* Stub functions */

    function setLiquidity(
        address token,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
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

    function overrideValidateObservation(bool overridden, bool validateObservation_) public {
        config.validateObservationOverridden = overridden;
        config.validateObservation = validateObservation_;
    }

    function stubValidateObservation(
        address token,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) public returns (bool) {
        bytes memory updateData = abi.encode(token);

        return super.validateObservation(updateData, tokenLiquidity, quoteTokenLiquidity);
    }

    function harnessChangeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateThreshold
    ) public view returns (bool) {
        return changeThresholdSurpassed(a, b, updateThreshold);
    }

    /* Overridden functions */

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
    }

    function validateObservation(
        bytes memory updateData,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) internal virtual override returns (bool) {
        if (config.validateObservationOverridden) return config.validateObservation;
        else return super.validateObservation(updateData, tokenLiquidity, quoteTokenLiquidity);
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        override
        returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity)
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

contract LiquidityAccumulatorStubCaller {
    LiquidityAccumulatorStub immutable callee;

    constructor(LiquidityAccumulatorStub callee_) {
        callee = callee_;
    }

    function stubValidateObservation(
        address token,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) public returns (bool) {
        return callee.stubValidateObservation(token, tokenLiquidity, quoteTokenLiquidity);
    }
}
