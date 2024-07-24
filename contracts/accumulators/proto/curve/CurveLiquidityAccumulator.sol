// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "./ICurvePool.sol";
import "../../LiquidityAccumulator.sol";

contract CurveLiquidityAccumulator is LiquidityAccumulator {
    using SafeCast for uint256;

    address public immutable curvePool;

    uint256 public immutable quoteTokenIndex;

    uint8 internal immutable _liquidityDecimals;

    uint256 internal immutable _decimalFactor;

    uint256 internal immutable _quoteTokenWholeUnit;

    mapping(address => uint256) tokenIndices;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address curvePool_,
        uint8 nCoins_,
        address poolQuoteToken_,
        address ourQuoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, ourQuoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        curvePool = curvePool_;

        uint256 quoteTokenIndex_ = type(uint256).max;

        ICurvePool pool = ICurvePool(curvePool_);
        for (uint256 i = 0; i < nCoins_; ++i) {
            address token = pool.coins(i);

            if (token == poolQuoteToken_)
                quoteTokenIndex_ = i; // Store quote token index
            else {
                // Add one to reserve 0 for invalid
                tokenIndices[token] = i + 1; // Store token indices
            }
        }

        require(quoteTokenIndex_ != type(uint256).max, "CurveLiquidityAccumulator: INVALID_QUOTE_TOKEN");

        quoteTokenIndex = quoteTokenIndex_;
        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;

        _quoteTokenWholeUnit = 10 ** super.quoteTokenDecimals();
    }

    /// @inheritdoc LiquidityAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        if (tokenIndices[token] == 0) return false;

        return super.canUpdate(data);
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));

        ICurvePool pool = ICurvePool(curvePool);

        uint256 tokenIndex = tokenIndices[token];
        require(tokenIndex != 0, "CurveLiquidityAccumulator: INVALID_TOKEN");

        uint256 _tokenLiquidity = pool.balances(tokenIndex - 1); // Subtract the added one
        uint256 _quoteTokenLiquidity = pool.balances(quoteTokenIndex);

        tokenLiquidity = ((_tokenLiquidity * _decimalFactor) / 10 ** IERC20Metadata(token).decimals()).toUint112();
        quoteTokenLiquidity = ((_quoteTokenLiquidity * _decimalFactor) / _quoteTokenWholeUnit).toUint112();
    }
}
