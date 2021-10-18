//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../../../interfaces/IOracle.sol";
import "../../../interfaces/ILiquidityAccumulator.sol";

import "../../../libraries/AccumulationLibrary.sol";
import "../../../libraries/ObservationLibrary.sol";

import "../../../libraries/uniswap-lib/FixedPoint.sol";
import "../../../libraries/uniswap-v2-periphery/UniswapV2OracleLibrary.sol";

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "hardhat/console.sol";

contract UniswapV2Oracle is IOracle {
    using FixedPoint for *;

    struct PriceObservation {
        uint32 timestamp;
        uint256 price0Cumulative;
        uint256 price1Cumulative;
    }

    address public immutable liquidityAccumulator;

    address public immutable uniswapFactory;

    address public immutable quoteToken;

    uint256 public immutable period;

    mapping(address => AccumulationLibrary.PriceAccumulator) public priceAccumulations;
    mapping(address => AccumulationLibrary.LiquidityAccumulator) public liquidityAccumulations;

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
        address liquidityAccumulator_,
        address uniswapFactory_,
        address quoteToken_,
        uint256 period_
    ) {
        liquidityAccumulator = liquidityAccumulator_;
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
        if (needsUpdate(token)) return _update(token);

        return false;
    }

    function consultPrice(address token) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "UniswapV2Oracle: MISSING_OBSERVATION");

        return observations[token].price;
    }

    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "UniswapV2Oracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "UniswapV2Oracle: RATE_TOO_OLD");

        return observation.price;
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "UniswapV2Oracle: MISSING_OBSERVATION");

        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function consultLiquidity(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "UniswapV2Oracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "UniswapV2Oracle: RATE_TOO_OLD");

        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
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

        require(observation.timestamp != 0, "UniswapV2Oracle: MISSING_OBSERVATION");

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

        require(observation.timestamp != 0, "UniswapV2Oracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "UniswapV2Oracle: RATE_TOO_OLD");

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function _update(address token) internal returns (bool) {
        address pairAddress = IUniswapV2Factory(uniswapFactory).getPair(token, quoteToken);

        require(pairAddress != address(0), "UniswapV2Oracle: POOL_NOT_FOUND");

        ObservationLibrary.Observation storage observation = observations[token];

        /*
         * 1. Update price
         */
        {
            IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

            // This is the timestamp when price0CumulativeLast and price1CumulativeLast was set
            (, , uint32 timestamp) = pair.getReserves();

            require(timestamp != 0, "UniswapV2Oracle: MISSING_RESERVES_TIMESTAMP");

            AccumulationLibrary.PriceAccumulator storage priceAccumulation = priceAccumulations[token];

            // Get current accumulations from Uniswap's price accumulator
            (
                uint256 cumulativeQuoteTokenPrice,
                uint256 cumulativeTokenPrice,
                uint32 blockTimestamp
            ) = UniswapV2OracleLibrary.currentCumulativePrices(pairAddress);

            if (token < quoteToken) {
                // Rearrange the values so that token0 in the underlying is always 'token'
                uint256 temp = cumulativeTokenPrice;
                cumulativeTokenPrice = cumulativeQuoteTokenPrice;
                cumulativeQuoteTokenPrice = temp;
            }

            if (priceAccumulation.timestamp == 0) {
                // No prior observation so we use the last observation data provided by the pair

                if (token < quoteToken) {
                    priceAccumulation.cumulativeTokenPrice = pair.price0CumulativeLast();
                    priceAccumulation.cumulativeQuoteTokenPrice = pair.price1CumulativeLast();
                } else {
                    priceAccumulation.cumulativeTokenPrice = pair.price1CumulativeLast();
                    priceAccumulation.cumulativeQuoteTokenPrice = pair.price0CumulativeLast();
                }

                priceAccumulation.timestamp = timestamp;
            }

            uint32 timeElapsed = blockTimestamp - uint32(priceAccumulation.timestamp); // overflow is desired
            if (timeElapsed != 0) {
                // Store price and current time
                observation.price = computeAmountOut(
                    priceAccumulation.cumulativeTokenPrice,
                    cumulativeTokenPrice,
                    timeElapsed,
                    computeWholeUnitAmount(token)
                );

                // Store current accumulations and the timestamp of them
                priceAccumulation.cumulativeTokenPrice = cumulativeTokenPrice;
                priceAccumulation.cumulativeQuoteTokenPrice = cumulativeQuoteTokenPrice;
                priceAccumulation.timestamp = blockTimestamp;
            }
        }

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

    function computeWholeUnitAmount(address token) internal view returns (uint256 amount) {
        amount = uint256(10)**IERC20(token).decimals();
    }

    // given the cumulative prices of the start and end of a period, and the length of the period, compute the average
    // price in terms of how much amount out is received for the amount in
    function computeAmountOut(
        uint256 priceCumulativeStart,
        uint256 priceCumulativeEnd,
        uint256 timeElapsed,
        uint256 amountIn
    ) internal pure returns (uint256 amountOut) {
        // overflow is desired.
        unchecked {
            FixedPoint.uq112x112 memory priceAverage = FixedPoint.uq112x112(
                uint224((priceCumulativeEnd - priceCumulativeStart) / timeElapsed)
            );
            amountOut = priceAverage.mul(amountIn).decode144();
        }
    }
}
