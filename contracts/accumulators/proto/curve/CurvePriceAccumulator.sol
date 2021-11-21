//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "./ICurvePool.sol";
import "../../PriceAccumulator.sol";

contract CurvePriceAccumulator is PriceAccumulator {
    int128 internal constant N_COINS = 3; // Pools have 2-3 coins, so we use 3 for max compatibility

    address public immutable curvePool;

    int128 public immutable quoteTokenIndex;

    constructor(
        address curvePool_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        curvePool = curvePool_;

        int128 quoteTokenIndex_ = -1;

        ICurvePool pool = ICurvePool(curvePool_);
        for (int128 i = 0; i < N_COINS; ++i) {
            // The following may revert if N_COINS > pool.N_COINS, but this is desired
            if (pool.coins(uint256(int256(i))) == quoteToken_) {
                quoteTokenIndex_ = i;

                break;
            }
        }

        require(quoteTokenIndex_ >= 0, "CurvePriceAccumulator: INVALID_QUOTE_TOKEN");

        quoteTokenIndex = quoteTokenIndex_;
    }

    function getTokenIndex(address token) internal view returns (int128 tokenIndex) {
        tokenIndex = -1;

        ICurvePool pool = ICurvePool(curvePool);
        for (int128 i = 0; i < N_COINS; ++i) {
            // The following may revert if N_COINS > pool.N_COINS, but this is desired
            if (pool.coins(uint256(int256(i))) == token) {
                tokenIndex = i;

                break;
            }
        }

        require(tokenIndex >= 0, "CurvePriceAccumulator: INVALID_TOKEN");
    }

    function computeWholeUnitAmount(address token) internal view returns (uint256 amount) {
        amount = uint256(10)**IERC20Metadata(token).decimals();
    }

    function fetchPrice(address token) internal view virtual override returns (uint256 price) {
        ICurvePool pool = ICurvePool(curvePool);

        int128 tokenIndex = getTokenIndex(token);
        uint256 tokenAmount = computeWholeUnitAmount(token);

        // Note: fees are included in the price
        price = pool.get_dy(tokenIndex, quoteTokenIndex, tokenAmount);
    }
}
