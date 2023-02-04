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

    struct BufferMetadata {
        uint16 start;
        uint16 end;
        uint16 size;
        uint16 maxSize;
    }

    address public immutable override liquidityAccumulator;
    address public immutable override priceAccumulator;

    mapping(address => BufferMetadata) public accumulationBufferMetadata;

    mapping(address => AccumulationLibrary.PriceAccumulator[]) public priceAccumulationBuffers;
    mapping(address => AccumulationLibrary.LiquidityAccumulator[]) public liquidityAccumulationBuffers;

    mapping(address => ObservationLibrary.Observation) internal observations;

    constructor(
        address liquidityAccumulator_,
        address priceAccumulator_,
        address quoteToken_,
        uint256 period_,
        uint256 granularity_
    ) PeriodicOracle(quoteToken_, period_, granularity_) {
        liquidityAccumulator = liquidityAccumulator_;
        priceAccumulator = priceAccumulator_;
    }

    function getLatestObservation(
        address token
    ) public view virtual override returns (ObservationLibrary.Observation memory observation) {
        return observations[token];
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

        BufferMetadata storage meta = accumulationBufferMetadata[token];

        // Return 0 if there are no observations (never updated)
        if (meta.size == 0) return 0;

        // Note: We ignore the last observation timestamp because it always updates when the accumulation timestamps
        // update.
        uint256 lastPriceAccumulationTimestamp = priceAccumulationBuffers[token][meta.end].timestamp;
        uint256 lastLiquidityAccumulationTimestamp = liquidityAccumulationBuffers[token][meta.end].timestamp;

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
        // We trade some freshness for greater reliability. Using too low of a tolerance reduces the cost of DoS.
        // Furthermore, large price fluctuations can require tokens to be bridged by arbitrageurs to fix DEX prices,
        // and this can take time. Price accumulators may not get updated during this time as we may require on-chain
        // prices to closely match off-chain prices.
        return 1 hours;
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
        return (_updateEvery * 2) + 5 minutes;
    }

    function initializeBuffers(address token) internal virtual {
        require(
            priceAccumulationBuffers[token].length == 0 && liquidityAccumulationBuffers[token].length == 0,
            "PeriodicAccumulationOracle: ALREADY_INITIALIZED"
        );

        BufferMetadata storage meta = accumulationBufferMetadata[token];

        // Initialize the buffers
        AccumulationLibrary.PriceAccumulator[] storage priceAccumulationBuffer = priceAccumulationBuffers[token];
        AccumulationLibrary.LiquidityAccumulator[] storage liquidityAccumulationBuffer = liquidityAccumulationBuffers[
            token
        ];

        for (uint256 i = 0; i < granularity; ++i) {
            priceAccumulationBuffer.push();
            liquidityAccumulationBuffer.push();
        }

        // Initialize the metadata
        meta.start = 0;
        meta.end = 0;
        meta.size = 0;
        meta.maxSize = uint16(granularity);
    }

    function push(
        address token,
        AccumulationLibrary.PriceAccumulator memory priceAccumulation,
        AccumulationLibrary.LiquidityAccumulator memory liquidityAccumulation
    ) internal virtual returns (bool) {
        BufferMetadata storage meta = accumulationBufferMetadata[token];

        if (meta.size == 0) {
            if (meta.maxSize == 0) {
                // Initialize the buffers
                initializeBuffers(token);
            }
        } else {
            // We have multiple accumulations now

            uint256 firstPriceAccumulationTime = priceAccumulationBuffers[token][meta.start].timestamp;
            uint256 pricePeriodTimeElapsed = priceAccumulation.timestamp - firstPriceAccumulationTime;

            uint256 firstLiquidityAccumulationTime = liquidityAccumulationBuffers[token][meta.start].timestamp;
            uint256 liquidityPeriodTimeElapsed = liquidityAccumulation.timestamp - firstLiquidityAccumulationTime;

            uint256 maxUpdateGap = period + updateDelayTolerance();

            if (
                meta.size == granularity &&
                pricePeriodTimeElapsed <= maxUpdateGap &&
                pricePeriodTimeElapsed >= period &&
                liquidityPeriodTimeElapsed <= maxUpdateGap &&
                liquidityPeriodTimeElapsed >= period
            ) {
                ObservationLibrary.Observation storage observation = observations[token];

                observation.price = IPriceAccumulator(priceAccumulator).calculatePrice(
                    priceAccumulationBuffers[token][meta.start],
                    priceAccumulation
                );
                (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(
                    liquidityAccumulator
                ).calculateLiquidity(liquidityAccumulationBuffers[token][meta.start], liquidityAccumulation);
                observation.timestamp = block.timestamp.toUint32();

                emit Updated(
                    token,
                    observation.price,
                    observation.tokenLiquidity,
                    observation.quoteTokenLiquidity,
                    observation.timestamp
                );
            } else if (pricePeriodTimeElapsed == 0 && liquidityPeriodTimeElapsed == 0) {
                // Both accumulations haven't changed, so we don't need to update
                return false;
            }

            meta.end = (meta.end + 1) % meta.maxSize;
        }

        priceAccumulationBuffers[token][meta.end] = priceAccumulation;
        liquidityAccumulationBuffers[token][meta.end] = liquidityAccumulation;

        if (meta.size < meta.maxSize && meta.end == meta.size) {
            // We are at the end of the array and we have not yet filled it
            meta.size++;
        } else {
            // start was just overwritten
            meta.start = (meta.start + 1) % meta.size;
        }

        return true;
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

        AccumulationLibrary.PriceAccumulator memory priceAccumulation = IPriceAccumulator(priceAccumulator)
            .getCurrentAccumulation(token);
        AccumulationLibrary.LiquidityAccumulator memory liquidityAccumulation = ILiquidityAccumulator(
            liquidityAccumulator
        ).getCurrentAccumulation(token);

        return
            priceAccumulation.timestamp != 0 &&
            liquidityAccumulation.timestamp != 0 &&
            push(token, priceAccumulation, liquidityAccumulation);
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
