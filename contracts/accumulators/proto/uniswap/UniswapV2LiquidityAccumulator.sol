//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../../LiquidityAccumulator.sol";

contract UniswapV2LiquidityAccumulator is LiquidityAccumulator {
    address immutable uniswapFactory;

    constructor(
        address uniswapFactory_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        uniswapFactory = uniswapFactory_;
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        // TODO: Inline this
        address pairAddress = IUniswapV2Factory(uniswapFactory).getPair(token, quoteToken);

        require(pairAddress != address(0), "UniswapV2LiquidityAccumulator: POOL_NOT_FOUND");

        (uint256 reserve0, uint256 reserve1, uint32 timestamp) = IUniswapV2Pair(pairAddress).getReserves();

        require(timestamp != 0, "UniswapV2LiquidityAccumulator: MISSING_RESERVES_TIMESTAMP");

        if (token < quoteToken) {
            tokenLiquidity = reserve0;
            quoteTokenLiquidity = reserve1;
        } else {
            tokenLiquidity = reserve1;
            quoteTokenLiquidity = reserve0;
        }
    }
}
