//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol";

import "../../LiquidityAccumulator.sol";

contract UniswapV3LiquidityAccumulator is LiquidityAccumulator {
    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    bytes32 internal constant POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    address public immutable uniswapFactory;

    uint24[] public poolFees;

    constructor(
        address uniswapFactory_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        uniswapFactory = uniswapFactory_;
        poolFees = poolFees_;
    }

    /// @notice Returns PoolKey: the ordered tokens with the matched fee levels
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @param fee The fee level of the pool
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal pure returns (PoolKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);
        return PoolKey({token0: tokenA, token1: tokenB, fee: fee});
    }

    /// @notice Deterministically computes the pool address given the factory and PoolKey
    /// @param factory The Uniswap V3 factory contract address
    /// @param key The PoolKey
    /// @return pool The contract address of the V3 pool
    function computeAddress(address factory, PoolKey memory key) internal pure returns (address pool) {
        require(key.token0 < key.token1);
        pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encode(key.token0, key.token1, key.fee)),
                            POOL_INIT_CODE_HASH
                        )
                    )
                )
            )
        );
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        uint256 fees0;
        uint256 fees1;

        uint256 len = poolFees.length;

        for (uint256 i = 0; i < len; ++i) {
            address pool = computeAddress(uniswapFactory, getPoolKey(token, quoteToken, poolFees[i]));

            if (isContract(pool)) {
                tokenLiquidity += IERC20Minimal(token).balanceOf(pool);
                quoteTokenLiquidity += IERC20Minimal(quoteToken).balanceOf(pool);

                (uint128 token0, uint128 token1) = IUniswapV3Pool(pool).protocolFees();

                fees0 += token0;
                fees1 += token1;
            }
        }

        // Subtract protocol fees from the totals
        if (token < quoteToken) {
            tokenLiquidity -= fees0;
            quoteTokenLiquidity -= fees1;
        } else {
            tokenLiquidity -= fees1;
            quoteTokenLiquidity -= fees0;
        }
    }

    function isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
