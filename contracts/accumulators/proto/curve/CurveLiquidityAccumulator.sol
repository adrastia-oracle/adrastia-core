//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./ICurvePool.sol";
import "../../LiquidityAccumulator.sol";

contract CurveLiquidityAccumulator is LiquidityAccumulator {
    address public immutable curvePool;

    uint256 public immutable quoteTokenIndex;

    mapping(address => uint256) tokenIndices;

    constructor(
        address curvePool_,
        uint8 nCoins_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        curvePool = curvePool_;

        uint256 quoteTokenIndex_ = type(uint256).max;

        ICurvePool pool = ICurvePool(curvePool_);
        for (uint256 i = 0; i < nCoins_; ++i) {
            address token = pool.coins(i);

            if (token == quoteToken_)
                quoteTokenIndex_ = i; // Store quote token index
            else {
                // Add one to reserve 0 for invalid
                tokenIndices[token] = i + 1; // Store token indices
            }
        }

        require(quoteTokenIndex_ != type(uint256).max, "CurveLiquidityAccumulator: INVALID_QUOTE_TOKEN");

        quoteTokenIndex = quoteTokenIndex_;
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        if (tokenIndices[token] == 0) return false;

        return super.needsUpdate(token);
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ICurvePool pool = ICurvePool(curvePool);

        uint256 tokenIndex = tokenIndices[token];
        require(tokenIndex != 0, "CurveLiquidityAccumulator: INVALID_TOKEN");

        tokenLiquidity = pool.balances(tokenIndex - 1); // Subtract the added one
        quoteTokenLiquidity = pool.balances(quoteTokenIndex);
    }
}