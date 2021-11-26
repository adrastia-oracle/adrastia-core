//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import "../../SafePeriodicOracle.sol";
import "../../../interfaces/ILiquidityAccumulator.sol";

import "../../../libraries/AccumulationLibrary.sol";
import "../../../libraries/ObservationLibrary.sol";

contract UniswapV3Oracle is SafePeriodicOracle {
    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    address public immutable liquidityAccumulator;

    address public immutable uniswapFactory;

    bytes32 public immutable initCodeHash;

    uint24[] public poolFees;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) public liquidityAccumulations;

    constructor(
        address liquidityAccumulator_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint256 period_
    ) SafePeriodicOracle(quoteToken_, period_) {
        liquidityAccumulator = liquidityAccumulator_;
        uniswapFactory = uniswapFactory_;
        initCodeHash = initCodeHash_;
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

    function calculatePrice(address token) internal returns (uint256 price) {
        uint256 len = poolFees.length;

        OracleLibrary.WeightedTickData[] memory periodObservations = new OracleLibrary.WeightedTickData[](len);

        bool hasLiquidity;

        for (uint256 i = 0; i < len; ++i) {
            address pool = computeAddress(uniswapFactory, initCodeHash, getPoolKey(token, quoteToken, poolFees[i]));

            if (isContract(pool)) {
                (periodObservations[i].tick, periodObservations[i].weight) = OracleLibrary.consult(
                    pool,
                    uint32(period)
                );

                hasLiquidity = hasLiquidity || periodObservations[i].weight > 0;
            }
        }

        require(hasLiquidity, "UniswapV3Oracle: NO_LIQUIDITY");

        int24 timeWeightedAverageTick = OracleLibrary.getWeightedArithmeticMeanTick(periodObservations);

        price = OracleLibrary.getQuoteAtTick(
            timeWeightedAverageTick,
            uint128(10**(IERC20(token).decimals())),
            token,
            quoteToken
        );
    }

    function _update(address token) internal override returns (bool) {
        ObservationLibrary.Observation storage observation = observations[token];

        /*
         * 1. Update price
         */
        observation.price = calculatePrice(token);

        /*
         * 2. Update liquidity
         */
        {
            // Note: We assume the accumulator is up-to-date (gas savings)
            AccumulationLibrary.LiquidityAccumulator memory freshAccumulation = ILiquidityAccumulator(
                liquidityAccumulator
            ).getCurrentAccumulation(token);

            uint256 lastAccumulationTime = liquidityAccumulations[token].timestamp;

            if (freshAccumulation.timestamp > lastAccumulationTime) {
                // Accumulator updated, so we update our observation

                if (lastAccumulationTime != 0) {
                    // We have two accumulations -> calculate liquidity from them
                    (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(
                        liquidityAccumulator
                    ).calculateLiquidity(liquidityAccumulations[token], freshAccumulation);
                }

                liquidityAccumulations[token] = freshAccumulation;
            }
        }

        // Update observation timestamp so that the oracle doesn't update again until the next period
        observation.timestamp = block.timestamp;

        emit Updated(
            token,
            quoteToken,
            block.timestamp,
            observation.price,
            observation.tokenLiquidity,
            observation.quoteTokenLiquidity
        );

        return true;
    }

    function isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }
}
