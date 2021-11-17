//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";

import "../../SafePeriodicOracle.sol";
import "../../../interfaces/ILiquidityAccumulator.sol";

import "../../../libraries/AccumulationLibrary.sol";
import "../../../libraries/ObservationLibrary.sol";

contract UniswapV3Oracle is SafePeriodicOracle {
    address public immutable liquidityAccumulator;

    address public immutable uniswapFactory;

    uint24[] public poolFees;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) public liquidityAccumulations;

    constructor(
        address liquidityAccumulator_,
        address uniswapFactory_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint256 period_
    ) SafePeriodicOracle(quoteToken_, period_) {
        liquidityAccumulator = liquidityAccumulator_;
        uniswapFactory = uniswapFactory_;
        poolFees = poolFees_;
    }

    function calculatePrice(address token) internal returns (uint256 price) {
        uint256 len = poolFees.length;

        OracleLibrary.WeightedTickData[] memory periodObservations = new OracleLibrary.WeightedTickData[](len);

        bool hasLiquidity;

        for (uint256 i = 0; i < len; ++i) {
            address pool = PoolAddress.computeAddress(
                uniswapFactory,
                PoolAddress.getPoolKey(token, quoteToken, poolFees[i])
            );

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
            // Always keep the liquidity accumulator up-to-date
            ILiquidityAccumulator(liquidityAccumulator).update(token);

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
