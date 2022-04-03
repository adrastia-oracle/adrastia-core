//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

pragma experimental ABIEncoderV2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import "./IUniswapV3Util.sol";
import "../libraries/AddressLibrary.sol";

contract UniswapV3Util is IUniswapV3Util {
    using AddressLibrary for address;

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    function calculateWeightedPrice(CalculateWeightedPriceParams calldata params)
        external
        view
        override
        returns (bool hasLiquidity, uint256 price)
    {
        uint256 len = params.poolFees.length;

        OracleLibrary.WeightedTickData[] memory periodObservations = new OracleLibrary.WeightedTickData[](len);

        for (uint256 i = 0; i < len; ++i) {
            address pool = computeAddress(
                params.uniswapFactory,
                params.initCodeHash,
                getPoolKey(params.token, params.quoteToken, params.poolFees[i])
            );

            if (pool.isContract()) {
                (periodObservations[i].tick, periodObservations[i].weight) = OracleLibrary.consult(pool, params.period);

                hasLiquidity = hasLiquidity || periodObservations[i].weight > 0;
            }
        }

        if (!hasLiquidity) return (false, 0);

        int24 timeWeightedAverageTick = OracleLibrary.getWeightedArithmeticMeanTick(periodObservations);

        price = OracleLibrary.getQuoteAtTick(
            timeWeightedAverageTick,
            params.tokenAmount,
            params.token,
            params.quoteToken
        );
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
    function computeAddress(
        address factory,
        bytes32 _initCodeHash,
        PoolKey memory key
    ) internal pure returns (address pool) {
        require(key.token0 < key.token1);
        pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encode(key.token0, key.token1, key.fee)),
                            _initCodeHash
                        )
                    )
                )
            )
        );
    }
}
