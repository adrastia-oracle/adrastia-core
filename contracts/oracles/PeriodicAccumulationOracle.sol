// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@openzeppelin-v4/contracts/utils/math/Math.sol";

import "./PeriodicOracle.sol";
import "../interfaces/ILiquidityAccumulator.sol";
import "../interfaces/IHasLiquidityAccumulator.sol";
import "../interfaces/IPriceAccumulator.sol";
import "../interfaces/IHasPriceAccumulator.sol";
import "../interfaces/IHistoricalPriceAccumulationOracle.sol";
import "../interfaces/IHistoricalLiquidityAccumulationOracle.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

contract PeriodicAccumulationOracle is
    IHistoricalPriceAccumulationOracle,
    IHistoricalLiquidityAccumulationOracle,
    PeriodicOracle,
    IHasLiquidityAccumulator,
    IHasPriceAccumulator
{
    using SafeCast for uint256;

    struct BufferMetadata {
        uint16 start;
        uint16 end;
        uint16 size;
        uint16 maxSize;
        uint16 flags; // Bit flags for future use
        uint112 __reserved; // Reserved for future use
        uint64 extra; // For user extensions
    }

    address public immutable override liquidityAccumulator;
    address public immutable override priceAccumulator;

    mapping(address => BufferMetadata) internal accumulationBufferMetadata;

    mapping(address => AccumulationLibrary.PriceAccumulator[]) internal priceAccumulationBuffers;
    mapping(address => AccumulationLibrary.LiquidityAccumulator[]) internal liquidityAccumulationBuffers;

    mapping(address => ObservationLibrary.Observation) internal observations;

    /// @notice Emitted when a stored quotation is updated.
    /// @param token The address of the token that the quotation is for.
    /// @param price The quote token denominated price for a whole token.
    /// @param tokenLiquidity The amount of the token that is liquid in the underlying pool, in wei.
    /// @param quoteTokenLiquidity The amount of the quote token that is liquid in the underlying pool, in wei.
    /// @param timestamp The epoch timestamp of the quotation (in seconds).
    event Updated(
        address indexed token,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity,
        uint256 timestamp
    );

    /// @notice Event emitted when an accumulation buffer's capacity is increased past the initial capacity.
    /// @dev Buffer initialization does not emit an event.
    /// @param token The token for which the accumulation buffer's capacity was increased.
    /// @param oldCapacity The previous capacity of the accumulation buffer.
    /// @param newCapacity The new capacity of the accumulation buffer.
    event AccumulationCapacityIncreased(address indexed token, uint256 oldCapacity, uint256 newCapacity);

    /// @notice Event emitted when an accumulation buffer's capacity is initialized.
    /// @param token The token for which the accumulation buffer's capacity was initialized.
    /// @param capacity The capacity of the accumulation buffer.
    event AccumulationCapacityInitialized(address indexed token, uint256 capacity);

    /// @notice Event emitted when an accumulation is pushed to the buffer.
    /// @param token The token for which the accumulation was pushed.
    /// @param priceCumulative The cumulative price of the token.
    /// @param priceTimestamp The timestamp of the cumulative price.
    /// @param tokenLiquidityCumulative The cumulative token liquidity of the token.
    /// @param quoteTokenLiquidityCumulative The cumulative quote token liquidity of the token.
    /// @param liquidityTimestamp The timestamp of the cumulative liquidity.
    event AccumulationPushed(
        address indexed token,
        uint256 priceCumulative,
        uint256 priceTimestamp,
        uint256 tokenLiquidityCumulative,
        uint256 quoteTokenLiquidityCumulative,
        uint256 liquidityTimestamp
    );

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

    /// @inheritdoc IHistoricalPriceAccumulationOracle
    function getPriceAccumulationAt(
        address token,
        uint256 index
    ) external view virtual override returns (AccumulationLibrary.PriceAccumulator memory) {
        BufferMetadata memory meta = accumulationBufferMetadata[token];

        require(index < meta.size, "PeriodicAccumulationOracle: INVALID_INDEX");

        uint256 bufferIndex = meta.end < index ? meta.end + meta.size - index : meta.end - index;

        return priceAccumulationBuffers[token][bufferIndex];
    }

    /// @inheritdoc IHistoricalPriceAccumulationOracle
    function getPriceAccumulations(
        address token,
        uint256 amount
    ) external view virtual override returns (AccumulationLibrary.PriceAccumulator[] memory) {
        return getPriceAccumulationsInternal(token, amount, 0, 1);
    }

    /// @inheritdoc IHistoricalPriceAccumulationOracle
    function getPriceAccumulations(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) external view virtual returns (AccumulationLibrary.PriceAccumulator[] memory) {
        return getPriceAccumulationsInternal(token, amount, offset, increment);
    }

    /// @inheritdoc IHistoricalPriceAccumulationOracle
    function getPriceAccumulationsCount(address token) external view override returns (uint256) {
        return accumulationBufferMetadata[token].size;
    }

    /// @inheritdoc IHistoricalPriceAccumulationOracle
    function getPriceAccumulationsCapacity(address token) external view virtual override returns (uint256) {
        uint256 maxSize = accumulationBufferMetadata[token].maxSize;
        if (maxSize == 0) return granularity;

        return maxSize;
    }

    /// @inheritdoc IHistoricalPriceAccumulationOracle
    /// @param amount The new capacity of accumulations for the token. Must be greater than the current capacity, but
    ///   less than 65536.
    function setPriceAccumulationsCapacity(address token, uint256 amount) external virtual override {
        setAccumulationsCapacityInternal(token, amount);
    }

    /// @inheritdoc IHistoricalLiquidityAccumulationOracle
    function getLiquidityAccumulationAt(
        address token,
        uint256 index
    ) external view virtual override returns (AccumulationLibrary.LiquidityAccumulator memory) {
        BufferMetadata memory meta = accumulationBufferMetadata[token];

        require(index < meta.size, "PeriodicAccumulationOracle: INVALID_INDEX");

        uint256 bufferIndex = meta.end < index ? meta.end + meta.size - index : meta.end - index;

        return liquidityAccumulationBuffers[token][bufferIndex];
    }

    /// @inheritdoc IHistoricalLiquidityAccumulationOracle
    function getLiquidityAccumulations(
        address token,
        uint256 amount
    ) external view virtual override returns (AccumulationLibrary.LiquidityAccumulator[] memory) {
        return getLiquidityAccumulationsInternal(token, amount, 0, 1);
    }

    /// @inheritdoc IHistoricalLiquidityAccumulationOracle
    function getLiquidityAccumulations(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) external view virtual returns (AccumulationLibrary.LiquidityAccumulator[] memory) {
        return getLiquidityAccumulationsInternal(token, amount, offset, increment);
    }

    /// @inheritdoc IHistoricalLiquidityAccumulationOracle
    function getLiquidityAccumulationsCount(address token) external view override returns (uint256) {
        return accumulationBufferMetadata[token].size;
    }

    /// @inheritdoc IHistoricalLiquidityAccumulationOracle
    function getLiquidityAccumulationsCapacity(address token) external view virtual override returns (uint256) {
        uint256 maxSize = accumulationBufferMetadata[token].maxSize;
        if (maxSize == 0) return granularity;

        return maxSize;
    }

    /// @inheritdoc IHistoricalLiquidityAccumulationOracle
    /// @param amount The new capacity of accumulations for the token. Must be greater than the current capacity, but
    ///   less than 65536.
    function setLiquidityAccumulationsCapacity(address token, uint256 amount) external virtual override {
        setAccumulationsCapacityInternal(token, amount);
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
            interfaceId == type(IHistoricalPriceAccumulationOracle).interfaceId ||
            interfaceId == type(IHistoricalLiquidityAccumulationOracle).interfaceId ||
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

    /// @notice The grace period that we allow for the oracle to be in need of an update (as the sum of all update
    ///   delays in a period) before we discard the last accumulation. If this grace period is exceeded, it will take
    ///   more updates to get a new observation.
    /// @dev This is to prevent longer time-weighted averages than we desire. The maximum period is then the period of
    ///   this oracle plus this grace period.
    /// @return The grace period in seconds.
    function updateDelayTolerance() public view virtual returns (uint256) {
        // We tolerate two missed periods plus 5 minutes (to allow for some time to update the oracles).
        // We trade off some freshness for greater reliability. Using too low of a tolerance reduces the cost of DoS
        // attacks.
        return (period * 2) + 5 minutes;
    }

    function setAccumulationsCapacityInternal(address token, uint256 amount) internal virtual {
        BufferMetadata storage meta = accumulationBufferMetadata[token];
        if (meta.maxSize == 0) {
            // Buffer is not initialized yet
            initializeBuffers(token);
        }

        require(amount >= meta.maxSize, "PeriodicAccumulationOracle: CAPACITY_CANNOT_BE_DECREASED");
        require(amount <= type(uint16).max, "PeriodicAccumulationOracle: CAPACITY_TOO_LARGE");

        AccumulationLibrary.PriceAccumulator[] storage priceAccumulationBuffer = priceAccumulationBuffers[token];
        AccumulationLibrary.LiquidityAccumulator[] storage liquidityAccumulationBuffer = liquidityAccumulationBuffers[
            token
        ];

        // Add new slots to the buffer
        uint256 capacityToAdd = amount - meta.maxSize;
        for (uint256 i = 0; i < capacityToAdd; ++i) {
            // Push dummy accumulations with non-zero values to put most of the gas cost on the caller
            priceAccumulationBuffer.push(AccumulationLibrary.PriceAccumulator({cumulativePrice: 1, timestamp: 1}));
            liquidityAccumulationBuffer.push(
                AccumulationLibrary.LiquidityAccumulator({
                    cumulativeTokenLiquidity: 1,
                    cumulativeQuoteTokenLiquidity: 1,
                    timestamp: 1
                })
            );
        }

        if (meta.maxSize != amount) {
            emit AccumulationCapacityIncreased(token, meta.maxSize, amount);

            // Update the metadata
            meta.maxSize = uint16(amount);
        }
    }

    function getPriceAccumulationsInternal(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) internal view virtual returns (AccumulationLibrary.PriceAccumulator[] memory) {
        if (amount == 0) return new AccumulationLibrary.PriceAccumulator[](0);

        BufferMetadata memory meta = accumulationBufferMetadata[token];
        require(meta.size > (amount - 1) * increment + offset, "PeriodicAccumulationOracle: INSUFFICIENT_DATA");

        AccumulationLibrary.PriceAccumulator[] memory accumulations = new AccumulationLibrary.PriceAccumulator[](
            amount
        );

        uint256 count = 0;

        for (
            uint256 i = meta.end < offset ? meta.end + meta.size - offset : meta.end - offset;
            count < amount;
            i = (i < increment) ? (i + meta.size) - increment : i - increment
        ) {
            accumulations[count++] = priceAccumulationBuffers[token][i];
        }

        return accumulations;
    }

    function getLiquidityAccumulationsInternal(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) internal view virtual returns (AccumulationLibrary.LiquidityAccumulator[] memory) {
        if (amount == 0) return new AccumulationLibrary.LiquidityAccumulator[](0);

        BufferMetadata memory meta = accumulationBufferMetadata[token];
        require(meta.size > (amount - 1) * increment + offset, "PeriodicAccumulationOracle: INSUFFICIENT_DATA");

        AccumulationLibrary.LiquidityAccumulator[]
            memory accumulations = new AccumulationLibrary.LiquidityAccumulator[](amount);

        uint256 count = 0;

        for (
            uint256 i = meta.end < offset ? meta.end + meta.size - offset : meta.end - offset;
            count < amount;
            i = (i < increment) ? (i + meta.size) - increment : i - increment
        ) {
            accumulations[count++] = liquidityAccumulationBuffers[token][i];
        }

        return accumulations;
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

        emit AccumulationCapacityInitialized(token, meta.maxSize);
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
            // Check that at least one accumulation is newer than the last one
            {
                uint256 lastPriceAccumulationTimestamp = priceAccumulationBuffers[token][meta.end].timestamp;
                uint256 lastLiquidityAccumulationTimestamp = liquidityAccumulationBuffers[token][meta.end].timestamp;

                // Note: Reverts if the new accumulations are older than the last ones
                uint256 lastPriceAccumulationTimeElapsed = priceAccumulation.timestamp - lastPriceAccumulationTimestamp;
                uint256 lastLiquidityAccumulationTimeElapsed = liquidityAccumulation.timestamp -
                    lastLiquidityAccumulationTimestamp;

                if (lastPriceAccumulationTimeElapsed == 0 && lastLiquidityAccumulationTimeElapsed == 0) {
                    // Both accumulations haven't changed, so we don't need to update
                    return false;
                }
            }

            meta.end = (meta.end + 1) % meta.maxSize;

            // Check if we have enough accumulations for a new observation
            if (meta.size >= granularity) {
                uint256 startIndex = meta.end < granularity
                    ? meta.end + meta.size - granularity
                    : meta.end - granularity;

                AccumulationLibrary.PriceAccumulator memory firstPriceAccumulation = priceAccumulationBuffers[token][
                    startIndex
                ];
                AccumulationLibrary.LiquidityAccumulator
                    memory firstLiquidityAccumulation = liquidityAccumulationBuffers[token][startIndex];

                uint256 pricePeriodTimeElapsed = priceAccumulation.timestamp - firstPriceAccumulation.timestamp;
                uint256 liquidityPeriodTimeElapsed = liquidityAccumulation.timestamp -
                    firstLiquidityAccumulation.timestamp;

                uint256 maxUpdateGap = period + updateDelayTolerance();

                if (
                    pricePeriodTimeElapsed <= maxUpdateGap &&
                    pricePeriodTimeElapsed >= period &&
                    liquidityPeriodTimeElapsed <= maxUpdateGap &&
                    liquidityPeriodTimeElapsed >= period
                ) {
                    ObservationLibrary.Observation storage observation = observations[token];

                    observation.price = IPriceAccumulator(priceAccumulator).calculatePrice(
                        firstPriceAccumulation,
                        priceAccumulation
                    );
                    (observation.tokenLiquidity, observation.quoteTokenLiquidity) = ILiquidityAccumulator(
                        liquidityAccumulator
                    ).calculateLiquidity(firstLiquidityAccumulation, liquidityAccumulation);
                    observation.timestamp = block.timestamp.toUint32();

                    emit Updated(
                        token,
                        observation.price,
                        observation.tokenLiquidity,
                        observation.quoteTokenLiquidity,
                        observation.timestamp
                    );
                }
            }
        }

        priceAccumulationBuffers[token][meta.end] = priceAccumulation;
        liquidityAccumulationBuffers[token][meta.end] = liquidityAccumulation;

        emit AccumulationPushed(
            token,
            priceAccumulation.cumulativePrice,
            priceAccumulation.timestamp,
            liquidityAccumulation.cumulativeTokenLiquidity,
            liquidityAccumulation.cumulativeQuoteTokenLiquidity,
            liquidityAccumulation.timestamp
        );

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
