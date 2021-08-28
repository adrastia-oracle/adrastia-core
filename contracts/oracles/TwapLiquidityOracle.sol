//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/ILiquidityOracle.sol";
import "../interfaces/ILiquidityAccumulator.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

import "hardhat/console.sol";

contract TwapLiquidityOracle is ILiquidityOracle {

    using SafeMath for uint256;

    address public immutable liquidityAccumulator;

    address public immutable quoteToken;

    uint256 public immutable period;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) accumulations;
    mapping(address => ObservationLibrary.LiquidityObservation) observations;

    constructor(address liquidityAccumulator_, address quoteToken_, uint256 period_) {
        require(ILiquidityAccumulator(liquidityAccumulator_).quoteToken() == quoteToken_);
        liquidityAccumulator = liquidityAccumulator_;
        quoteToken = quoteToken_;
        period = period_;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        uint256 deltaTime = block.timestamp.sub(observations[token].timestamp);

        return deltaTime >= period;
    }

    function update(address token) override external {
        if (needsUpdate(token)) {
            // Always keep the liquidity accumulator up-to-date
            ILiquidityAccumulator(liquidityAccumulator).update(token);

            AccumulationLibrary.LiquidityAccumulator memory freshAccumulation = ILiquidityAccumulator(liquidityAccumulator).getAccumulation(token);

            uint256 lastAccumulationTime = accumulations[token].timestamp;

            if (freshAccumulation.timestamp > lastAccumulationTime) {
                // Accumulator updated, so we update our observation

                if (lastAccumulationTime != 0) {
                    // We have two accumulations -> calculate liquidity from them
                    ObservationLibrary.LiquidityObservation storage observation = observations[token];

                    (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(liquidityAccumulator).calculateLiquidity(accumulations[token], freshAccumulation);
                    observation.timestamp = block.timestamp;
                } else {
                    // Only one accumulation, so we use the accumulator's last observation
                    observations[token] = ILiquidityAccumulator(liquidityAccumulator).getLastObservation(token);

                    // Update observation timestamp so that the oracle doesn't update again until the next period
                    observations[token].timestamp = block.timestamp;
                }

                accumulations[token] = freshAccumulation;
            }
        }
    }

    function consultLiquidity(address token) override virtual public view
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.LiquidityObservation storage observation = observations[token];

        require(observation.timestamp != 0, "TwapLiquidityOracle: NO_OBSERVATION");

        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }
}