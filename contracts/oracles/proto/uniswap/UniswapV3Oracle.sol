//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";

import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";

import "../../SafePeriodicOracle.sol";

import "../../../libraries/ObservationLibrary.sol";

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";

contract UniswapV3Oracle is SafePeriodicOracle {
    using LowGasSafeMath for uint256;

    address public immutable uniswapFactory;

    constructor(
        address uniswapFactory_,
        address quoteToken_,
        uint32 period_
    ) SafePeriodicOracle(quoteToken_, period_) {
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

        if (tick == type(int256).max) --tick;

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
        OracleLibrary.WeightedTickData[] memory periodObservations = new OracleLibrary.WeightedTickData[](3);

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
                (periodObservations[0].tick, periodObservations[0].weight) = OracleLibrary.consult(
                    poolAddress500,
                    uint32(period)
                );

                (uint256 amount0, uint256 amount1) = calculateAmounts(poolAddress500, periodObservations[0].weight);

                total0 = total0.add(amount0);
                total1 = total1.add(amount1);
            }

            if (isContract(poolAddress3000)) {
                (periodObservations[1].tick, periodObservations[1].weight) = OracleLibrary.consult(
                    poolAddress3000,
                    uint32(period)
                );

                (uint256 amount0, uint256 amount1) = calculateAmounts(poolAddress3000, periodObservations[1].weight);

                total0 = total0.add(amount0);
                total1 = total1.add(amount1);
            }

            if (isContract(poolAddress10000)) {
                (periodObservations[2].tick, periodObservations[2].weight) = OracleLibrary.consult(
                    poolAddress10000,
                    uint32(period)
                );

                (uint256 amount0, uint256 amount1) = calculateAmounts(poolAddress10000, periodObservations[2].weight);

                total0 = total0.add(amount0);
                total1 = total1.add(amount1);
            }
        }

        uint128 liquidity = periodObservations[0].weight + periodObservations[1].weight + periodObservations[2].weight;

        require(liquidity != 0, "UniswapV3Oracle: NO_LIQUIDITY");

        int24 timeWeightedAverageTick = OracleLibrary.getWeightedArithmeticMeanTick(periodObservations);

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
