//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../../LiquidityAccumulator.sol";

contract UniswapV2LiquidityAccumulator is LiquidityAccumulator {
    address public immutable uniswapFactory;

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
        address pairAddress = pairFor(uniswapFactory, token, quoteToken);

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

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2Library: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        address tokenA,
        address tokenB
    ) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1)),
                            hex"96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" // init code hash
                        )
                    )
                )
            )
        );
    }
}
