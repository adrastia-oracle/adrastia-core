//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./ICurvePool.sol";
import "../../LiquidityAccumulator.sol";

contract CurveLiquidityAccumulator is LiquidityAccumulator {
    uint256 internal constant N_COINS = 3; // Pools have 2-3 coins, so we use 3 for max compatibility

    address public immutable curvePool;

    uint256 public immutable quoteTokenIndex;

    constructor(
        address curvePool_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        curvePool = curvePool_;

        uint256 quoteTokenIndex_ = type(uint256).max;

        ICurvePool pool = ICurvePool(curvePool_);
        for (uint256 i = 0; i < N_COINS; ++i) {
            // The following may revert if N_COINS > pool.N_COINS, but this is desired
            if (pool.coins(i) == quoteToken_) {
                quoteTokenIndex_ = i;

                break;
            }
        }

        require(quoteTokenIndex_ != type(uint256).max, "CurveLiquidityAccumulator: INVALID_QUOTE_TOKEN");

        quoteTokenIndex = quoteTokenIndex_;
    }

    function getTokenIndex(address token) internal view returns (uint256 tokenIndex) {
        tokenIndex = type(uint256).max;

        ICurvePool pool = ICurvePool(curvePool);
        for (uint256 i = 0; i < N_COINS; ++i) {
            // The following may revert if N_COINS > pool.N_COINS, but this is desired
            if (pool.coins(i) == token) {
                tokenIndex = i;

                break;
            }
        }

        require(tokenIndex != type(uint256).max, "CurveLiquidityAccumulator: INVALID_TOKEN");
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ICurvePool pool = ICurvePool(curvePool);

        uint256 tokenIndex = getTokenIndex(token);

        tokenLiquidity = pool.balances(tokenIndex);
        quoteTokenLiquidity = pool.balances(quoteTokenIndex);
    }
}
