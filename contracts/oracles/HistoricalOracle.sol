//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../interfaces/IHistoricalOracle.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract HistoricalOracle is IHistoricalOracle {
    struct BufferMetadata {
        uint16 start;
        uint16 end;
        uint16 size;
        uint16 maxSize;
        uint16 flags; // Bit flags for future use
        uint112 __reserved; // Reserved for future use
        uint64 extra; // For user extensions
    }

    mapping(address => BufferMetadata) internal observationBufferMetadata;

    mapping(address => ObservationLibrary.Observation[]) internal observationBuffers;

    uint16 internal immutable initialCapacity;

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

    /// @notice Event emitted when an observation buffer's capacity is increased past the initial capacity.
    /// @dev Buffer initialization does not emit an event.
    /// @param token The token for which the observation buffer's capacity was increased.
    /// @param oldCapacity The previous capacity of the observation buffer.
    /// @param newCapacity The new capacity of the observation buffer.
    event ObservationCapacityIncreased(address indexed token, uint256 oldCapacity, uint256 newCapacity);

    /// @notice Event emitted when an observation buffer's capacity is initialized.
    /// @param token The token for which the observation buffer's capacity was initialized.
    /// @param capacity The capacity of the observation buffer.
    event ObservationCapacityInitialized(address indexed token, uint256 capacity);

    /// @notice An error that is thrown if we try to initialize an observation buffer that has already been initialized.
    /// @param token The token for which we tried to initialize the observation buffer.
    error BufferAlreadyInitialized(address token);

    /// @notice An error that is thrown if we try to retrieve an observation at an invalid index.
    /// @param token The token for which we tried to retrieve the observation.
    /// @param index The index of the observation that we tried to retrieve.
    /// @param size The size of the observation buffer.
    error InvalidIndex(address token, uint256 index, uint256 size);

    /// @notice An error that is thrown if we try to decrease the capacity of an observation buffer.
    /// @param token The token for which we tried to decrease the capacity of the observation buffer.
    /// @param amount The capacity that we tried to decrease the observation buffer to.
    /// @param currentCapacity The current capacity of the observation buffer.
    error CapacityCannotBeDecreased(address token, uint256 amount, uint256 currentCapacity);

    /// @notice An error that is thrown if we try to increase the capacity of an observation buffer past the maximum capacity.
    /// @param token The token for which we tried to increase the capacity of the observation buffer.
    /// @param amount The capacity that we tried to increase the observation buffer to.
    /// @param maxCapacity The maximum capacity of the observation buffer.
    error CapacityTooLarge(address token, uint256 amount, uint256 maxCapacity);

    /// @notice An error that is thrown if we try to retrieve more observations than are available in the observation buffer.
    /// @param token The token for which we tried to retrieve the observations.
    /// @param size The size of the observation buffer.
    /// @param minSizeRequired The minimum size of the observation buffer that we require.
    error InsufficientData(address token, uint256 size, uint256 minSizeRequired);

    constructor(uint16 initialCapacity_) {
        initialCapacity = initialCapacity_;
    }

    /// @inheritdoc IHistoricalOracle
    function getObservationAt(
        address token,
        uint256 index
    ) external view virtual override returns (ObservationLibrary.Observation memory) {
        BufferMetadata memory meta = observationBufferMetadata[token];

        if (index >= meta.size) {
            revert InvalidIndex(token, index, meta.size);
        }

        uint256 bufferIndex = meta.end < index ? meta.end + meta.size - index : meta.end - index;

        return observationBuffers[token][bufferIndex];
    }

    /// @inheritdoc IHistoricalOracle
    function getObservations(
        address token,
        uint256 amount
    ) external view virtual override returns (ObservationLibrary.Observation[] memory) {
        return getObservationsInternal(token, amount, 0, 1);
    }

    /// @inheritdoc IHistoricalOracle
    function getObservations(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) external view virtual returns (ObservationLibrary.Observation[] memory) {
        return getObservationsInternal(token, amount, offset, increment);
    }

    /// @inheritdoc IHistoricalOracle
    function getObservationsCount(address token) external view override returns (uint256) {
        return observationBufferMetadata[token].size;
    }

    /// @inheritdoc IHistoricalOracle
    function getObservationsCapacity(address token) external view virtual override returns (uint256) {
        uint256 maxSize = observationBufferMetadata[token].maxSize;
        if (maxSize == 0) return initialCapacity;

        return maxSize;
    }

    /// @inheritdoc IHistoricalOracle
    /// @param amount The new capacity of observations for the token. Must be greater than the current capacity, but
    ///   less than 65536.
    function setObservationsCapacity(address token, uint256 amount) external virtual override {
        BufferMetadata storage meta = observationBufferMetadata[token];
        if (meta.maxSize == 0) {
            // Buffer is not initialized yet
            initializeBuffers(token);
        }

        if (amount < meta.maxSize) revert CapacityCannotBeDecreased(token, amount, meta.maxSize);
        if (amount > type(uint16).max) revert CapacityTooLarge(token, amount, type(uint16).max);

        ObservationLibrary.Observation[] storage observationBuffer = observationBuffers[token];

        // Add new slots to the buffer
        uint256 capacityToAdd = amount - meta.maxSize;
        for (uint256 i = 0; i < capacityToAdd; ++i) {
            // Push a dummy observation with non-zero values to put most of the gas cost on the caller
            observationBuffer.push(
                ObservationLibrary.Observation({price: 1, tokenLiquidity: 1, quoteTokenLiquidity: 1, timestamp: 1})
            );
        }

        if (meta.maxSize != amount) {
            emit ObservationCapacityIncreased(token, meta.maxSize, amount);

            // Update the metadata
            meta.maxSize = uint16(amount);
        }
    }

    function getObservationsInternal(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) internal view virtual returns (ObservationLibrary.Observation[] memory) {
        if (amount == 0) return new ObservationLibrary.Observation[](0);

        BufferMetadata memory meta = observationBufferMetadata[token];
        if (meta.size <= (amount - 1) * increment + offset)
            revert InsufficientData(token, meta.size, (amount - 1) * increment + offset + 1);

        ObservationLibrary.Observation[] memory observations = new ObservationLibrary.Observation[](amount);

        uint256 count = 0;

        for (
            uint256 i = meta.end < offset ? meta.end + meta.size - offset : meta.end - offset;
            count < amount;
            i = (i < increment) ? (i + meta.size) - increment : i - increment
        ) {
            observations[count++] = observationBuffers[token][i];
        }

        return observations;
    }

    function initializeBuffers(address token) internal virtual {
        if (observationBuffers[token].length != 0) {
            revert BufferAlreadyInitialized(token);
        }

        BufferMetadata storage meta = observationBufferMetadata[token];

        // Initialize the buffers
        ObservationLibrary.Observation[] storage observationBuffer = observationBuffers[token];

        for (uint256 i = 0; i < initialCapacity; ++i) {
            observationBuffer.push();
        }

        // Initialize the metadata
        meta.start = 0;
        meta.end = 0;
        meta.size = 0;
        meta.maxSize = initialCapacity;

        emit ObservationCapacityInitialized(token, meta.maxSize);
    }

    function push(address token, ObservationLibrary.Observation memory observation) internal virtual {
        BufferMetadata storage meta = observationBufferMetadata[token];

        if (meta.size == 0) {
            if (meta.maxSize == 0) {
                // Initialize the buffers
                initializeBuffers(token);
            }
        } else {
            meta.end = (meta.end + 1) % meta.maxSize;
        }

        observationBuffers[token][meta.end] = observation;

        emit Updated(
            token,
            observation.price,
            observation.tokenLiquidity,
            observation.quoteTokenLiquidity,
            block.timestamp
        );

        if (meta.size < meta.maxSize && meta.end == meta.size) {
            // We are at the end of the array and we have not yet filled it
            meta.size++;
        } else {
            // start was just overwritten
            meta.start = (meta.start + 1) % meta.size;
        }
    }
}
