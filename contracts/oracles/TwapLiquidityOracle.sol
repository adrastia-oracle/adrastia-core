//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../interfaces/ILiquidityOracle.sol";
import "../interfaces/ILiquidityAccumulator.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

contract TwapLiquidityOracle is ILiquidityOracle {
    address public immutable liquidityAccumulator;

    address public immutable quoteToken;

    uint256 public immutable period;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) accumulations;
    mapping(address => ObservationLibrary.LiquidityObservation) observations;

    constructor(
        address liquidityAccumulator_,
        address quoteToken_,
        uint256 period_
    ) {
        require(ILiquidityAccumulator(liquidityAccumulator_).quoteToken() == quoteToken_);
        liquidityAccumulator = liquidityAccumulator_;
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

    function update(address token) external override returns (bool) {
        if (needsUpdate(token)) return _update(token);

        return false;
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.LiquidityObservation storage observation = observations[token];

        require(observation.timestamp != 0, "TwapLiquidityOracle: MISSING_OBSERVATION");

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
        ObservationLibrary.LiquidityObservation storage observation = observations[token];

        require(observation.timestamp != 0, "TwapLiquidityOracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "TwapLiquidityOracle: RATE_TOO_OLD");

        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function _update(address token) internal returns (bool) {
        // Always keep the liquidity accumulator up-to-date
        bool accumulatorUpdated = ILiquidityAccumulator(liquidityAccumulator).update(token);

        AccumulationLibrary.LiquidityAccumulator memory freshAccumulation = ILiquidityAccumulator(liquidityAccumulator)
            .getAccumulation(token);

        uint256 lastAccumulationTime = accumulations[token].timestamp;

        if (freshAccumulation.timestamp > lastAccumulationTime) {
            // Accumulator updated, so we update our observation

            if (lastAccumulationTime != 0) {
                // We have two accumulations -> calculate liquidity from them
                ObservationLibrary.LiquidityObservation storage observation = observations[token];

                (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(
                    liquidityAccumulator
                ).calculateLiquidity(accumulations[token], freshAccumulation);
                observation.timestamp = block.timestamp;
            } else {
                // Only one accumulation, so we use the accumulator's last observation
                observations[token] = ILiquidityAccumulator(liquidityAccumulator).getLastObservation(token);

                // Update observation timestamp so that the oracle doesn't update again until the next period
                observations[token].timestamp = block.timestamp;
            }

            accumulations[token] = freshAccumulation;

            return true;
        }

        return accumulatorUpdated;
    }
}
