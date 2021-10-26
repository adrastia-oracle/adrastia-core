//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../../../interfaces/IOracle.sol";

import "../../../libraries/ObservationLibrary.sol";

import "../../../libraries/uniswap-v3-periphery/OracleLibrary.sol";
import "../../../libraries/uniswap-v3-periphery/WeightedOracleLibrary.sol";
import "../../../libraries/uniswap-v3-periphery/PoolAddress.sol";
import "../../../libraries/uniswap-v3-periphery/LiquidityAmounts.sol";

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";

contract UniswapV3Oracle is IOracle {
    address public immutable uniswapFactory;

    address public immutable quoteToken;

    uint32 public immutable period;

    mapping(address => ObservationLibrary.Observation) public observations;

    event Updated(
        address indexed token,
        address indexed quoteToken,
        uint256 indexed timestamp,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    );

    constructor(
        address uniswapFactory_,
        address quoteToken_,
        uint32 period_
    ) {
        uniswapFactory = uniswapFactory_;
        quoteToken = quoteToken_;
        period = period_;
    }

    function quoteTokenAddress() public view virtual override returns (address) {
        return quoteToken;
    }

    function quoteTokenSymbol() public view virtual override returns (string memory) {
        revert("TODO");
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        uint256 deltaTime = block.timestamp - observations[token].timestamp;

        return deltaTime >= period;
    }

    function update(address token) external virtual override returns (bool) {
        if (needsUpdate(token)) {
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

        return false;
    }

    function consult(address token)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "UniswapV3Oracle: MISSING_OBSERVATION");

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "UniswapV3Oracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp - maxAge, "UniswapV3Oracle: RATE_TOO_OLD");

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function consultPrice(address token) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");

        price = consultation.price;
    }

    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "SlidingWindowOracle: RATE_TOO_OLD");

        price = consultation.price;
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");

        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.quoteTokenLiquidity;
    }

    function consultLiquidity(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "SlidingWindowOracle: RATE_TOO_OLD");

        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.quoteTokenLiquidity;
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

        WeightedOracleLibrary.PeriodObservation[]
            memory periodObservations = new WeightedOracleLibrary.PeriodObservation[](3);

        if (isContract(poolAddress500)) periodObservations[0] = WeightedOracleLibrary.consult(poolAddress500, period);

        if (isContract(poolAddress3000)) periodObservations[1] = WeightedOracleLibrary.consult(poolAddress3000, period);

        if (isContract(poolAddress10000))
            periodObservations[2] = WeightedOracleLibrary.consult(poolAddress10000, period);

        int24 timeWeightedAverageTick = WeightedOracleLibrary.getArithmeticMeanTickWeightedByLiquidity(
            periodObservations
        );

        price = OracleLibrary.getQuoteAtTick(
            timeWeightedAverageTick,
            uint128(10**(IERC20(token).decimals())),
            token,
            quoteToken
        );

        uint128 liquidity = periodObservations[0].harmonicMeanLiquidity +
            periodObservations[1].harmonicMeanLiquidity +
            periodObservations[2].harmonicMeanLiquidity;

        // TODO: Better overflow checking
        require(liquidity >= periodObservations[1].harmonicMeanLiquidity, "UniswapV3DataSource: LIQUIDITY_OVERFLOW");

        uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(timeWeightedAverageTick);
        uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(timeWeightedAverageTick + 1);

        uint256 amount0 = LiquidityAmounts.getAmount0ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);
        uint256 amount1 = LiquidityAmounts.getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);

        if (token < quoteToken) {
            tokenLiquidity = amount0;
            quoteTokenLiquidity = amount1;
        } else {
            tokenLiquidity = amount1;
            quoteTokenLiquidity = amount0;
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
