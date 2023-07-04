// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/ERC20.sol";

import {IStablePool, IBasePool} from "../accumulators/proto/balancer/BalancerV2StablePriceAccumulator.sol";

contract BalancerStablePoolStub is IStablePool, IBasePool, ERC20 {
    struct PauseState {
        bool paused;
        uint256 pauseWindowEndTime;
        uint256 bufferPeriodEndTime;
    }

    bool internal recoveryMode;

    bool internal supportsRecoveryMode;

    bool internal supportsPausedState;

    bool internal supportsPaused;

    bool internal hasBptToken;

    uint256 internal bptIndex;

    uint256 internal amplificationParameter;

    bool internal isAmplificationParameterUpdating;

    uint256[] internal scalingFactors;

    uint256 internal swapFeePercentage;

    bytes32 internal immutable poolId;

    PauseState internal pauseState;

    constructor(bytes32 poolId_, uint256[] memory scalingFactors_) ERC20("BPT", "BPT") {
        poolId = poolId_;
        scalingFactors = scalingFactors_;

        supportsRecoveryMode = true;
        supportsPausedState = true;
        supportsPaused = true;
    }

    function getBptIndex() external view returns (uint256) {
        if (!hasBptToken) revert();

        return bptIndex;
    }

    function getPoolId() external view returns (bytes32) {
        return poolId;
    }

    function getPausedState() external view returns (bool, uint256, uint256) {
        if (!supportsPausedState) revert();

        return (pauseState.paused, pauseState.pauseWindowEndTime, pauseState.bufferPeriodEndTime);
    }

    function paused() external view returns (bool) {
        if (!supportsPaused) revert();

        return pauseState.paused;
    }

    function inRecoveryMode() external view returns (bool) {
        if (!supportsRecoveryMode) revert();

        return recoveryMode;
    }

    function getScalingFactors() external view returns (uint256[] memory) {
        return scalingFactors;
    }

    function getAmplificationParameter() external view returns (uint256, bool) {
        return (amplificationParameter, isAmplificationParameterUpdating);
    }

    function getSwapFeePercentage() external view returns (uint256) {
        return swapFeePercentage;
    }

    function stubSetRecoveryMode(bool active) external {
        recoveryMode = active;
    }

    function stubSetAmplificationParameter(uint256 newAmplificationParameter, bool isUpdating) external {
        amplificationParameter = newAmplificationParameter;
        isAmplificationParameterUpdating = isUpdating;
    }

    function stubSetSwapFeePercentage(uint256 newSwapFeePercentage) external {
        swapFeePercentage = newSwapFeePercentage;
    }

    function stubSetScalingFactors(uint256[] memory newScalingFactors) external {
        scalingFactors = newScalingFactors;
    }

    function stubSetBptIndex(uint256 newBptIndex) external {
        bptIndex = newBptIndex;
        hasBptToken = true;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function stubSetRecoveryModeSupported(bool supported) external {
        supportsRecoveryMode = supported;
    }

    function stubSetPausedStateSupported(bool supported) external {
        supportsPausedState = supported;
    }

    function stubSetPausedSupported(bool supported) external {
        supportsPaused = supported;
    }

    function stubSetPausedState(bool _paused, uint256 pauseWindowEndTime, uint256 bufferPeriodEndTime) external {
        pauseState.paused = _paused;
        pauseState.pauseWindowEndTime = pauseWindowEndTime;
        pauseState.bufferPeriodEndTime = bufferPeriodEndTime;
    }

    function stubSetPaused(bool _paused) external {
        pauseState.paused = _paused;
        pauseState.pauseWindowEndTime = type(uint256).max;
        pauseState.bufferPeriodEndTime = type(uint256).max;
    }
}
