// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {ILinearPool, IBasePool} from "../accumulators/proto/balancer/BalancerV2LiquidityAccumulator.sol";

contract BalancerLinearPoolStub is IBasePool, ILinearPool {
    bool internal recoveryMode;

    uint256 internal rate;

    uint256[] internal scalingFactors;

    bytes32 internal immutable poolId;

    address internal immutable mainToken;

    uint256 internal immutable mainIndex;

    constructor(bytes32 poolId_, address mainToken_, uint256 mainIndex_) {
        poolId = poolId_;
        mainToken = mainToken_;
        mainIndex = mainIndex_;
    }

    function getPoolId() external view returns (bytes32) {
        return poolId;
    }

    function inRecoveryMode() external view returns (bool) {
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
}
