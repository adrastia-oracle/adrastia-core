//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

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

    /// @inheritdoc PeriodicOracle
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        uint256 gracePeriod = accumulatorUpdateDelayTolerance();

        if (
            IUpdateable(priceAccumulator).timeSinceLastUpdate(data) >=
            IAccumulator(priceAccumulator).heartbeat() + gracePeriod ||
            IUpdateable(liquidityAccumulator).timeSinceLastUpdate(data) >=
            IAccumulator(liquidityAccumulator).heartbeat() + gracePeriod
        ) {
            // Shouldn't update if the accumulators are not up-to-date
            return false;
        }

        return super.canUpdate(data);
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

    /// @inheritdoc IOracle
    function liquidityDecimals() public view virtual override returns (uint8) {
        return ILiquidityAccumulator(liquidityAccumulator).liquidityDecimals();
    }

    /// @notice The grace period that we allow for the accumulators to be in need of a heartbeat update before we
    ///   consider it to be out-of-date.
    /// @return The grace period in seconds.
    function accumulatorUpdateDelayTolerance() public view virtual returns (uint256) {
        return 1800; // 30 minutes
    }

    /// @notice The grace period that we allow for the oracle to be in need of an update before we discard the last
    ///   accumulation. If this grace period is exceeded, it will take two updates to get a new observation.
    /// @dev This is to prevent longer time-weighted averages than we desire. The maximum period is then the period of
    ///   this oracle plus this grace period.
    /// @return The grace period in seconds.
    function updateDelayTolerance() public view virtual returns (uint256) {
        // We tolerate two missed periods plus 5 minutes (to allow for some time to update the oracles).
        // We trade off some freshness for greater reliability. Using too low of a tolerance reduces the cost of DoS
        // attacks.
        return (period * 2) + 5 minutes;
    }

    function performUpdate(bytes memory data) internal virtual override returns (bool) {
        // We require that the accumulators have a heartbeat update that is within the grace period (i.e. they are
        // up-to-date).
        // If they are not up-to-date, the oracle will not update.
        // It is expected that oracle consumers will check the last update time before using the data as to avoid using
        // stale data.
        {
            uint256 gracePeriod = accumulatorUpdateDelayTolerance();

            require(
                IUpdateable(priceAccumulator).timeSinceLastUpdate(data) <
                    IAccumulator(priceAccumulator).heartbeat() + gracePeriod,
                "PeriodicAccumulationOracle: PRICE_ACCUMULATOR_NEEDS_UPDATE"
            );
            require(
                IUpdateable(liquidityAccumulator).timeSinceLastUpdate(data) <
                    IAccumulator(liquidityAccumulator).heartbeat() + gracePeriod,
                "PeriodicAccumulationOracle: LIQUIDITY_ACCUMULATOR_NEEDS_UPDATE"
            );
        }

        address token = abi.decode(data, (address));

        ObservationLibrary.Observation memory observation = observations[token];

        bool updatedObservation;
        bool missingPrice;
        bool anythingUpdated;
        bool observationExpired;

        /*
         * 1. Update price
         */
        {
            AccumulationLibrary.PriceAccumulator memory freshAccumulation = IPriceAccumulator(priceAccumulator)
                .getCurrentAccumulation(token);

            AccumulationLibrary.PriceAccumulator storage lastAccumulation = priceAccumulations[token];

            uint256 lastAccumulationTime = priceAccumulations[token].timestamp;

            if (freshAccumulation.timestamp > lastAccumulationTime) {
                // Accumulator updated, so we update our observation

                if (lastAccumulationTime != 0) {
                    if (freshAccumulation.timestamp - lastAccumulationTime > period + updateDelayTolerance()) {
                        // The accumulator is too far behind, so we discard the last accumulation and wait for the
                        // next update.
                        observationExpired = true;
                    } else {
                        // We have two accumulations -> calculate price from them
                        observation.price = IPriceAccumulator(priceAccumulator).calculatePrice(
                            lastAccumulation,
                            freshAccumulation
                        );

                        updatedObservation = true;
                    }
                } else {
                    // This is our first update (or rather, we have our first accumulation)
                    // Record that we're missing the price to later prevent the observation timestamp and event
                    // from being emitted (no timestamp = missing observation and consult reverts).
                    missingPrice = true;
                }

                lastAccumulation.cumulativePrice = freshAccumulation.cumulativePrice;
                lastAccumulation.timestamp = freshAccumulation.timestamp;

                anythingUpdated = true;
            }
        }

        /*
         * 2. Update liquidity
         */
        {
            AccumulationLibrary.LiquidityAccumulator memory freshAccumulation = ILiquidityAccumulator(
                liquidityAccumulator
            ).getCurrentAccumulation(token);

            AccumulationLibrary.LiquidityAccumulator storage lastAccumulation = liquidityAccumulations[token];

            uint256 lastAccumulationTime = liquidityAccumulations[token].timestamp;

            if (freshAccumulation.timestamp > lastAccumulationTime) {
                // Accumulator updated, so we update our observation

                if (lastAccumulationTime != 0) {
                    if (freshAccumulation.timestamp - lastAccumulationTime > period + updateDelayTolerance()) {
                        // The accumulator is too far behind, so we discard the last accumulation and wait for the
                        // next update.
                        observationExpired = true;
                    } else {
                        // We have two accumulations -> calculate liquidity from them
                        (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(
                            liquidityAccumulator
                        ).calculateLiquidity(lastAccumulation, freshAccumulation);

                        updatedObservation = true;
                    }
                }

                lastAccumulation.cumulativeTokenLiquidity = freshAccumulation.cumulativeTokenLiquidity;
                lastAccumulation.cumulativeQuoteTokenLiquidity = freshAccumulation.cumulativeQuoteTokenLiquidity;
                lastAccumulation.timestamp = freshAccumulation.timestamp;

                anythingUpdated = true;
            }
        }

        // We only want to update the timestamp and emit an event when both the observation has been updated and we
        // have a price (even if the accumulator calculates a price of 0).
        // Note: We rely on consult reverting when the observation timestamp is 0.
        if (updatedObservation && !missingPrice && !observationExpired) {
            ObservationLibrary.Observation storage storageObservation = observations[token];

            storageObservation.price = observation.price;
            storageObservation.tokenLiquidity = observation.tokenLiquidity;
            storageObservation.quoteTokenLiquidity = observation.quoteTokenLiquidity;
            storageObservation.timestamp = block.timestamp.toUint32();

            emit Updated(
                token,
                observation.price,
                observation.tokenLiquidity,
                observation.quoteTokenLiquidity,
                block.timestamp
            );
        }

        return anythingUpdated;
    }

    /// @inheritdoc AbstractOracle
    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        // We assume the accumulators are also oracles... the interfaces need to be refactored
        price = IPriceOracle(priceAccumulator).consultPrice(token, 0);
        (tokenLiquidity, quoteTokenLiquidity) = ILiquidityOracle(liquidityAccumulator).consultLiquidity(token, 0);
    }
}
