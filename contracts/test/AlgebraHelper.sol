// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "./vendor/algebra/LiquidityManagement.sol";

contract AlgebraHelper is LiquidityManagement {
    constructor(
        address _uniswapFactory,
        address _poolDeployer,
        address _weth9
    ) PeripheryImmutableState(_uniswapFactory, _poolDeployer, _weth9) {}

    function helperAddLiquidity(
        AddLiquidityParams memory params
    ) public returns (uint128 liquidity, uint256 amount0, uint256 amount1, IAlgebraPool pool) {
        return addLiquidity(params);
    }
}
