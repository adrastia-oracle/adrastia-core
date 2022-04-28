//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@openzeppelin-v4/contracts/utils/math/Math.sol";

import "./PeriodicOracle.sol";
import "../interfaces/ILiquidityAccumulator.sol";
import "../interfaces/IHasLiquidityAccumulator.sol";
import "../interfaces/IPriceAccumulator.sol";
import "../interfaces/IHasPriceAccumulator.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

contract PeriodicAccumulationOracle is PeriodicOracle, IHasLiquidityAccumulator, IHasPriceAccumulator {
    using SafeCast for uint256;

    address public immutable override liquidityAccumulator;
    address public immutable override priceAccumulator;

    mapping(address => AccumulationLibrary.PriceAccumulator) public priceAccumulations;
    mapping(address => AccumulationLibrary.LiquidityAccumulator) public liquidityAccumulations;

    constructor(
        address liquidityAccumulator_,
        address priceAccumulator_,
        address quoteToken_,
        uint256 period_
    ) PeriodicOracle(quoteToken_, period_) {
        liquidityAccumulator = liquidityAccumulator_;
        priceAccumulator = priceAccumulator_;
    }

    /// @inheritdoc AbstractOracle
    function lastUpdateTime(bytes memory data) public view virtual override returns (uint256) {
        address token = abi.decode(data, (address));

        // Note: We ignore the last observation timestamp because it always updates when the accumulation timestamps
        // update.
        uint256 lastPriceAccumulationTimestamp = priceAccumulations[token].timestamp;
        uint256 lastLiquidityAccumulationTimestamp = liquidityAccumulations[token].timestamp;

        return Math.max(lastPriceAccumulationTimestamp, lastLiquidityAccumulationTimestamp);
    }

    /// @inheritdoc PeriodicOracle
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IHasLiquidityAccumulator).interfaceId ||
            interfaceId == type(IHasPriceAccumulator).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function performUpdate(bytes memory data) internal virtual override returns (bool) {
        address token = abi.decode(data, (address));

        ObservationLibrary.Observation storage observation = observations[token];

        bool updatedObservation;

        /*
         * 1. Update price
         */
        {
            // Note: We assume the accumulator is up-to-date (gas savings)
            AccumulationLibrary.PriceAccumulator memory freshAccumulation = IPriceAccumulator(priceAccumulator)
                .getCurrentAccumulation(token);

            AccumulationLibrary.PriceAccumulator storage lastAccumulation = priceAccumulations[token];

            uint256 lastAccumulationTime = priceAccumulations[token].timestamp;

            if (freshAccumulation.timestamp > lastAccumulationTime) {
                // Accumulator updated, so we update our observation

                if (lastAccumulationTime != 0) {
                    // We have two accumulations -> calculate price from them
                    observation.price = IPriceAccumulator(priceAccumulator).calculatePrice(
                        lastAccumulation,
                        freshAccumulation
                    );

                    updatedObservation = true;
                }

                lastAccumulation.cumulativePrice = freshAccumulation.cumulativePrice;
                lastAccumulation.timestamp = freshAccumulation.timestamp;
            }
        }

        /*
         * 2. Update liquidity
         */
        {
            // Note: We assume the accumulator is up-to-date (gas savings)
            AccumulationLibrary.LiquidityAccumulator memory freshAccumulation = ILiquidityAccumulator(
                liquidityAccumulator
            ).getCurrentAccumulation(token);

            AccumulationLibrary.LiquidityAccumulator storage lastAccumulation = liquidityAccumulations[token];

            uint256 lastAccumulationTime = liquidityAccumulations[token].timestamp;

            if (freshAccumulation.timestamp > lastAccumulationTime) {
                // Accumulator updated, so we update our observation

                if (lastAccumulationTime != 0) {
                    // We have two accumulations -> calculate liquidity from them
                    (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(
                        liquidityAccumulator
                    ).calculateLiquidity(lastAccumulation, freshAccumulation);

                    updatedObservation = true;
                }

                lastAccumulation.cumulativeTokenLiquidity = freshAccumulation.cumulativeTokenLiquidity;
                lastAccumulation.cumulativeQuoteTokenLiquidity = freshAccumulation.cumulativeQuoteTokenLiquidity;
                lastAccumulation.timestamp = freshAccumulation.timestamp;
            }
        }

        if (updatedObservation) {
            observation.timestamp = block.timestamp.toUint32();

            emit Updated(
                token,
                observation.price,
                observation.tokenLiquidity,
                observation.quoteTokenLiquidity,
                block.timestamp
            );
        }

        return true;
    }
}
