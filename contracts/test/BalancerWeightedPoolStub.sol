// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IBasePool, IWeightedPool} from "../accumulators/proto/balancer/BalancerV2WeightedPriceAccumulator.sol";

contract BalancerWeightedPoolStub is IBasePool, IWeightedPool {
    bool internal recoveryMode;

    bool internal supportsRecoveryMode;

    bytes32 internal immutable poolId;

    uint256[] internal weights;

    constructor(bytes32 poolId_, uint256[] memory weights_) {
        recoveryMode = false;
        weights = weights_;
        poolId = poolId_;

        supportsRecoveryMode = true;
    }

    function getPoolId() external view returns (bytes32) {
        return poolId;
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
}
