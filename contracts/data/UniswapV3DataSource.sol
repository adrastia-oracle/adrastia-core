//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

import "../interfaces/IDataSource.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap-mirror/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap-mirror/v3-periphery/contracts/libraries/WeightedOracleLibrary.sol";
import "@uniswap-mirror/v3-periphery/contracts/libraries/PoolAddress.sol";
import "@uniswap-mirror/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import '@uniswap-mirror/v3-core/contracts/interfaces/IUniswapV3Pool.sol';

contract UniswapV3DataSource is IDataSource {

    using SafeMath for uint128;

    uint32 immutable public observationPeriod;

    address immutable public uniswapFactory;

    address immutable public override quoteToken;

    constructor(address uniswapFactory_, address quoteToken_, uint32 observationPeriod_) {
        uniswapFactory = uniswapFactory_;
        quoteToken = quoteToken_;
        observationPeriod = observationPeriod_;
    }

    function fetchPriceAndLiquidity(address token) override virtual public view returns(bool success, uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity) {
        address poolAddress500 = PoolAddress.computeAddress(uniswapFactory, PoolAddress.getPoolKey(token, quoteToken, 500));
        address poolAddress3000 = PoolAddress.computeAddress(uniswapFactory, PoolAddress.getPoolKey(token, quoteToken, 3000));
        address poolAddress10000 = PoolAddress.computeAddress(uniswapFactory, PoolAddress.getPoolKey(token, quoteToken, 10000));

        WeightedOracleLibrary.PeriodObservation[] memory observations = new WeightedOracleLibrary.PeriodObservation[](3);

        if (isContract(poolAddress500))
            observations[0] = WeightedOracleLibrary.consult(poolAddress500, observationPeriod);
        
        if (isContract(poolAddress3000))
            observations[1] = WeightedOracleLibrary.consult(poolAddress3000, observationPeriod);

        if (isContract(poolAddress10000))
            observations[2] = WeightedOracleLibrary.consult(poolAddress10000, observationPeriod);

        int24 timeWeightedAverageTick = WeightedOracleLibrary.getArithmeticMeanTickWeightedByLiquidity(observations);

        price = OracleLibrary.getQuoteAtTick(timeWeightedAverageTick, uint128(10**(ERC20(token).decimals())), token, quoteToken);

        uint128 liquidity = observations[0].harmonicMeanLiquidity + observations[1].harmonicMeanLiquidity + observations[2].harmonicMeanLiquidity;

        // TODO: Better overflow checking
        require(liquidity >= observations[1].harmonicMeanLiquidity, "UniswapV3DataSource: LIQUIDITY_OVERFLOW");

        uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(timeWeightedAverageTick);
        uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(timeWeightedAverageTick + 1);

        uint256 amount0 = LiquidityAmounts.getAmount0ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);
        uint256 amount1 = LiquidityAmounts.getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);

        if (token < quoteToken) {
            tokenLiquidity = amount0;
            baseLiquidity = amount1;
        } else {
            tokenLiquidity = amount1;
            baseLiquidity = amount0;
        }

        success = true;
    }

    function fetchPrice(address token) override virtual public view returns(bool success, uint256 price) {
        (success, price,,) = fetchPriceAndLiquidity(token);
    }

    function fetchLiquidity(address token) override virtual public view returns(bool success, uint256 tokenLiquidity, uint256 baseLiquidity) {
        (success,, tokenLiquidity, baseLiquidity) = fetchPriceAndLiquidity(token);
    }

    function isContract(address addr) internal view returns(bool) {
        uint size;
        assembly {
            size := extcodesize(addr)
        }
        return size > 0;
    }

}
