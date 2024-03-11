// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {IAloc} from "../../../accumulators/proto/truefi/AlocUtilizationAndErrorAccumulator.sol";

contract AlocStub is IAloc {
    uint256 public constant BASIS_PRECISION = 1e4;

    uint256 internal _utilization;
    uint256 internal _liquidAssets;

    function stubSetUtilization(uint256 utilization_) external {
        _utilization = utilization_;
    }

    function stubSetLiquidAssets(uint256 liquidAssets_) external {
        _liquidAssets = liquidAssets_;
    }

    function utilization() external view override returns (uint256) {
        return _utilization;
    }

    function liquidAssets() external view override returns (uint256) {
        return _liquidAssets;
    }
}
