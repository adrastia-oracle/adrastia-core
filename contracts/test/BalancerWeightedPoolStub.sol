// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IBasePool, IWeightedPool} from "../accumulators/proto/balancer/BalancerV2WeightedPriceAccumulator.sol";

contract BalancerWeightedPoolStub is IBasePool, IWeightedPool {
    struct PauseState {
        bool paused;
        uint256 pauseWindowEndTime;
        uint256 bufferPeriodEndTime;
    }

    bool internal recoveryMode;

    bool internal supportsRecoveryMode;

    bool internal supportsPausedState;

    bool internal supportsPaused;

    bytes32 internal immutable poolId;

    uint256[] internal weights;

    PauseState internal pauseState;

    constructor(bytes32 poolId_, uint256[] memory weights_) {
        recoveryMode = false;
        weights = weights_;
        poolId = poolId_;

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

    function getNormalizedWeights() external view returns (uint256[] memory) {
        return weights;
    }

    function stubSetRecoveryMode(bool active) external {
        recoveryMode = active;
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
