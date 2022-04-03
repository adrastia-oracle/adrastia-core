//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

pragma experimental ABIEncoderV2;

import "../../../libraries/SafeCastExt.sol";

import "./ICurvePool.sol";
import "../../LiquidityAccumulator.sol";

contract CurveLiquidityAccumulator is LiquidityAccumulator {
    using SafeCastExt for uint256;

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
        returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity)
    {
        ICurvePool pool = ICurvePool(curvePool);

        uint256 tokenIndex = tokenIndices[token];
        require(tokenIndex != 0, "CurveLiquidityAccumulator: INVALID_TOKEN");

        tokenLiquidity = pool.balances(tokenIndex - 1).toUint112(); // Subtract the added one
        quoteTokenLiquidity = pool.balances(quoteTokenIndex).toUint112();
    }
}
