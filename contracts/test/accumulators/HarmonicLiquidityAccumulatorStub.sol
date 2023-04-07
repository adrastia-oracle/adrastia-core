// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/HarmonicLiquidityAccumulator.sol";

contract HarmonicLiquidityAccumulatorStub is HarmonicLiquidityAccumulator {
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
        bool useLastAccumulationAsCurrent;
    }

    mapping(address => MockLiquidity) public mockLiquidity;

    Config public config;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) HarmonicLiquidityAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    /* Stub functions */

    function setLiquidity(address token, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) public {
        MockLiquidity storage liquidity = mockLiquidity[token];

        liquidity.tokenLiquidity = tokenLiquidity;
        liquidity.quoteTokenLiquidity = quoteTokenLiquidity;
    }

    function stubSetObservation(
        address token,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity,
        uint32 timestamp
    ) public {
        ObservationLibrary.LiquidityObservation storage observation = observations[token];

        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
        observation.timestamp = timestamp;
    }

    function stubSetAccumulation(
        address token,
        uint112 cumulativeTokenLiquidity,
        uint112 cumulativeQuoteTokenLiquidity,
        uint32 timestamp
    ) public {
        AccumulationLibrary.LiquidityAccumulator storage accumulation = accumulations[token];

        accumulation.cumulativeTokenLiquidity = cumulativeTokenLiquidity;
        accumulation.cumulativeQuoteTokenLiquidity = cumulativeQuoteTokenLiquidity;
        accumulation.timestamp = timestamp;
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

    function overrideCurrentAccumulation(bool useLastAccumulationAsCurrent) public {
        config.useLastAccumulationAsCurrent = useLastAccumulationAsCurrent;
    }

    function stubValidateObservation(
        bytes memory updateData,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) public returns (bool) {
        return super.validateObservation(updateData, tokenLiquidity, quoteTokenLiquidity);
    }

    function stubFetchLiquidity(
        address token
    ) public view returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity) {
        return fetchLiquidity(abi.encode(token));
    }

    function harnessChangeThresholdSurpassed(uint256 a, uint256 b, uint256 updateThreshold) public view returns (bool) {
        return changeThresholdSurpassed(a, b, updateThreshold);
    }

    /* Overridden functions */

    function liquidityDecimals() public view virtual override returns (uint8) {
        return 0;
    }

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

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));

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

    function getCurrentAccumulation(
        address token
    ) public view virtual override returns (AccumulationLibrary.LiquidityAccumulator memory accumulation) {
        if (config.useLastAccumulationAsCurrent) return getLastAccumulation(token);
        else return super.getCurrentAccumulation(token);
    }
}

contract HarmonicLiquidityAccumulatorStubCaller {
    HarmonicLiquidityAccumulatorStub immutable callee;

    constructor(HarmonicLiquidityAccumulatorStub callee_) {
        callee = callee_;
    }

    function stubValidateObservation(
        address token,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) public returns (bool) {
        return callee.stubValidateObservation(abi.encode(token), tokenLiquidity, quoteTokenLiquidity);
    }
}
