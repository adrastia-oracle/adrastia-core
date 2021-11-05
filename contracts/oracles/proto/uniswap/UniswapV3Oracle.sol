//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "../../PeriodicOracle.sol";

import "../../../libraries/ObservationLibrary.sol";

import "../../../libraries/uniswap-v3-periphery/OracleLibrary.sol";
import "../../../libraries/uniswap-v3-periphery/WeightedOracleLibrary.sol";
import "../../../libraries/uniswap-v3-periphery/PoolAddress.sol";
import "../../../libraries/uniswap-v3-periphery/LiquidityAmounts.sol";

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";

contract UniswapV3Oracle is PeriodicOracle {
    address public immutable uniswapFactory;

    constructor(
        address uniswapFactory_,
        address quoteToken_,
        uint32 period_
    ) PeriodicOracle(quoteToken_, period_) {
        uniswapFactory = uniswapFactory_;
    }

    function _update(address token) internal override returns (bool) {
        ObservationLibrary.Observation storage observation = observations[token];

        (observation.price, observation.tokenLiquidity, observation.quoteTokenLiquidity) = consultFresh(token);
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

    function calculateAmounts(address pool, uint128 liquidity)
        internal
        view
        returns (uint256 amount0, uint256 amount1)
    {
        (uint160 sqrtPriceX96, int24 tick, , , , , ) = IUniswapV3Pool(pool).slot0();

        uint160 sqrtRatioX96A = TickMath.getSqrtRatioAtTick(tick);
        uint160 sqrtRatioX96B = TickMath.getSqrtRatioAtTick(tick + 1);

        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            sqrtRatioX96A,
            sqrtRatioX96B,
            liquidity
        );
    }

    function consultFresh(address token)
        internal
        view
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        WeightedOracleLibrary.PeriodObservation[]
            memory periodObservations = new WeightedOracleLibrary.PeriodObservation[](3);

        uint256 total0;
        uint256 total1;

        {
            address poolAddress500 = PoolAddress.computeAddress(
                uniswapFactory,
                PoolAddress.getPoolKey(token, quoteToken, 500)
            );
            address poolAddress3000 = PoolAddress.computeAddress(
                uniswapFactory,
                PoolAddress.getPoolKey(token, quoteToken, 3000)
            );
            address poolAddress10000 = PoolAddress.computeAddress(
                uniswapFactory,
                PoolAddress.getPoolKey(token, quoteToken, 10000)
            );

            if (isContract(poolAddress500)) {
                periodObservations[0] = WeightedOracleLibrary.consult(poolAddress500, uint32(period));

                (uint256 amount0, uint256 amount1) = calculateAmounts(
                    poolAddress500,
                    periodObservations[0].harmonicMeanLiquidity
                );

                total0 += amount0;
                total1 += amount1;
            }

            if (isContract(poolAddress3000)) {
                periodObservations[1] = WeightedOracleLibrary.consult(poolAddress3000, uint32(period));

                (uint256 amount0, uint256 amount1) = calculateAmounts(
                    poolAddress3000,
                    periodObservations[1].harmonicMeanLiquidity
                );

                total0 += amount0;
                total1 += amount1;
            }

            if (isContract(poolAddress10000)) {
                periodObservations[2] = WeightedOracleLibrary.consult(poolAddress10000, uint32(period));

                (uint256 amount0, uint256 amount1) = calculateAmounts(
                    poolAddress10000,
                    periodObservations[2].harmonicMeanLiquidity
                );

                total0 += amount0;
                total1 += amount1;
            }
        }

        uint128 liquidity = periodObservations[0].harmonicMeanLiquidity +
            periodObservations[1].harmonicMeanLiquidity +
            periodObservations[2].harmonicMeanLiquidity;

        require(liquidity != 0, "UniswapV3Oracle: NO_LIQUIDITY");

        int24 timeWeightedAverageTick = WeightedOracleLibrary.getArithmeticMeanTickWeightedByLiquidity(
            periodObservations
        );

        price = OracleLibrary.getQuoteAtTick(
            timeWeightedAverageTick,
            uint128(10**(IERC20(token).decimals())),
            token,
            quoteToken
        );

        if (token < quoteToken) {
            tokenLiquidity = total0;
            quoteTokenLiquidity = total1;
        } else {
            tokenLiquidity = total1;
            quoteTokenLiquidity = total0;
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
