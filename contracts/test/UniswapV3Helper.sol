// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v3-periphery/contracts/base/LiquidityManagement.sol";

contract UniswapV3Helper is LiquidityManagement {
    constructor(address uniswapFactory, address weth9) PeripheryImmutableState(uniswapFactory, weth9) {}

    function helperAddLiquidity(AddLiquidityParams memory params)
        public
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            IUniswapV3Pool pool
        )
    {
        return addLiquidity(params);
    }
}
