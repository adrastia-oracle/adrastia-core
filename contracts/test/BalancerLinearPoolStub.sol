// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {ILinearPool, IBasePool} from "../accumulators/proto/balancer/BalancerV2LiquidityAccumulator.sol";

contract BalancerLinearPoolStub is IBasePool, ILinearPool {
    struct PauseState {
        bool paused;
        uint256 pauseWindowEndTime;
        uint256 bufferPeriodEndTime;
    }

    bool internal recoveryMode;

    bool internal supportsRecoveryMode;

    bool internal supportsPausedState;

    bool internal supportsPaused;

    uint256 internal rate;

    uint256[] internal scalingFactors;

    bytes32 internal immutable poolId;

    address internal immutable mainToken;

    uint256 internal immutable mainIndex;

    PauseState internal pauseState;

    constructor(bytes32 poolId_, address mainToken_, uint256 mainIndex_) {
        poolId = poolId_;
        mainToken = mainToken_;
        mainIndex = mainIndex_;

        supportsRecoveryMode = true;
        supportsPausedState = true;
        supportsPaused = true;
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

    function getMainIndex() external view returns (uint256) {
        return mainIndex;
    }

    function getMainToken() external view returns (address) {
        return mainToken;
    }

    function getRate() external view returns (uint256) {
        return rate;
    }

    function getScalingFactors() external view returns (uint256[] memory) {
        return scalingFactors;
    }

    function stubSetScalingFactors(uint256[] memory scalingFactors_) external {
        scalingFactors = scalingFactors_;
    }

    function stubSetRecoveryMode(bool active) external {
        recoveryMode = active;
    }

    function stubSetRate(uint256 newRate) external {
        rate = newRate;
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
