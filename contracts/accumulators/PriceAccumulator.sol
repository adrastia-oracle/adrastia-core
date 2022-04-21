//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "../interfaces/IPriceAccumulator.sol";
import "../interfaces/IPriceOracle.sol";
import "../libraries/ObservationLibrary.sol";
import "../libraries/AddressLibrary.sol";
import "../utils/SimpleQuotationMetadata.sol";

abstract contract PriceAccumulator is IERC165, IPriceAccumulator, IPriceOracle, SimpleQuotationMetadata {
    using AddressLibrary for address;
    using SafeCast for uint256;

    struct PendingObservation {
        uint32 blockNumber;
        uint112 price;
    }

    uint256 public constant OBSERVATION_BLOCK_MIN_PERIOD = 10;
    uint256 public constant OBSERVATION_BLOCK_MAX_PERIOD = 20;

    uint256 internal constant CHANGE_PRECISION_DECIMALS = 8;
    uint256 internal constant CHANGE_PRECISION = 10**CHANGE_PRECISION_DECIMALS;

    uint256 public immutable updateThreshold;
    uint256 public immutable minUpdateDelay;
    uint256 public immutable maxUpdateDelay;

    uint256 public immutable override changePrecision = CHANGE_PRECISION;

    mapping(address => AccumulationLibrary.PriceAccumulator) public accumulations;
    mapping(address => ObservationLibrary.PriceObservation) public observations;

    /// @notice Stores observations held for OBSERVATION_BLOCK_PERIOD before being committed to an update.
    /// @dev address(token) => address(poster) => PendingObservation
    mapping(address => mapping(address => PendingObservation)) public pendingObservations;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) SimpleQuotationMetadata(quoteToken_) {
        updateThreshold = updateThreshold_;
        minUpdateDelay = minUpdateDelay_;
        maxUpdateDelay = maxUpdateDelay_;
    }

    /// @inheritdoc IPriceAccumulator
    function calculatePrice(
        AccumulationLibrary.PriceAccumulator calldata firstAccumulation,
        AccumulationLibrary.PriceAccumulator calldata secondAccumulation
    ) external pure virtual override returns (uint112 price) {
        require(firstAccumulation.timestamp != 0, "PriceAccumulator: TIMESTAMP_CANNOT_BE_ZERO");

        uint32 deltaTime = secondAccumulation.timestamp - firstAccumulation.timestamp;
        require(deltaTime != 0, "PriceAccumulator: DELTA_TIME_CANNOT_BE_ZERO");

        unchecked {
            // Underflow is desired and results in correct functionality
            price = (secondAccumulation.cumulativePrice - firstAccumulation.cumulativePrice) / deltaTime;
        }
    }

    /// Checks if this accumulator needs an update by checking the time since the last update and the change in
    ///   liquidities.
    /// @inheritdoc IUpdateByToken
    function needsUpdate(address token) public view virtual override returns (bool) {
        ObservationLibrary.PriceObservation storage lastObservation = observations[token];
        uint256 deltaTime = block.timestamp - lastObservation.timestamp;
        if (deltaTime < minUpdateDelay) {
            // Ensures updates occur at most once every minUpdateDelay (seconds)
            return false;
        } else if (deltaTime >= maxUpdateDelay) {
            // Ensures updates occur (optimistically) at least once every maxUpdateDelay (seconds)
            return true;
        }

        /*
         * maxUpdateDelay > deltaTime >= minUpdateDelay
         *
         * Check if the % change in price warrants an update (saves gas vs. always updating on change)
         */

        uint256 price = fetchPrice(token);

        return changeThresholdSurpassed(price, lastObservation.price, updateThreshold);
    }

    /// @inheritdoc IUpdateByToken
    function canUpdate(address token) public view virtual override returns (bool) {
        // If this accumulator doesn't need an update, it can't (won't) update
        if (!needsUpdate(token)) return false;

        PendingObservation storage pendingObservation = pendingObservations[token][msg.sender];

        // Check if pending update can be initialized (or if it's the first update)
        if (pendingObservation.blockNumber == 0) return true;

        // Validating observation (second update call)

        // Check if observation period has passed
        if (block.number - pendingObservation.blockNumber < OBSERVATION_BLOCK_MIN_PERIOD) return false;

        return true;
    }

    /// @notice Updates the accumulator.
    /// @dev Must be called by an EOA to limit the attack vector, unless it's the first observation for a token.
    /// @param token The address of the token to accumulate the price of.
    /// @return updated True if anything (other than a pending observation) was updated; false otherwise.
    function update(address token) public virtual override returns (bool) {
        if (needsUpdate(token)) return _update(token);

        return false;
    }

    /// @inheritdoc IPriceAccumulator
    function getLastAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.PriceAccumulator memory)
    {
        return accumulations[token];
    }

    /// @inheritdoc IPriceAccumulator
    function getCurrentAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.PriceAccumulator memory accumulation)
    {
        ObservationLibrary.PriceObservation storage lastObservation = observations[token];
        require(lastObservation.timestamp != 0, "PriceAccumulator: UNINITIALIZED");

        accumulation = accumulations[token]; // Load last accumulation

        uint32 deltaTime = (block.timestamp - lastObservation.timestamp).toUint32();

        if (deltaTime != 0) {
            // The last observation price has existed for some time, so we add that
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the last price multiplied by the time that price was active
                accumulation.cumulativePrice += lastObservation.price * deltaTime;

                accumulation.timestamp = block.timestamp.toUint32();
            }
        }
    }

    /// @inheritdoc IPriceAccumulator
    function getLastObservation(address token)
        public
        view
        virtual
        override
        returns (ObservationLibrary.PriceObservation memory)
    {
        return observations[token];
    }

    /// @inheritdoc IPriceAccumulator
    function getCurrentObservation(address token)
        public
        view
        virtual
        override
        returns (ObservationLibrary.PriceObservation memory observation)
    {
        observation.price = fetchPrice(token);
        observation.timestamp = block.timestamp.toUint32();
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(IERC165, SimpleQuotationMetadata)
        returns (bool)
    {
        return
            interfaceId == type(IPriceAccumulator).interfaceId ||
            interfaceId == type(IPriceOracle).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IPriceOracle
    function consultPrice(address token) public view virtual override returns (uint112 price) {
        return fetchPrice(token);
    }

    /// @inheritdoc IPriceOracle
    function consultPrice(address token, uint256) public view virtual override returns (uint112 price) {
        return fetchPrice(token);
    }

    function _update(address token) internal virtual returns (bool) {
        uint112 price = fetchPrice(token);

        ObservationLibrary.PriceObservation storage observation = observations[token];
        AccumulationLibrary.PriceAccumulator storage accumulation = accumulations[token];

        if (observation.timestamp == 0) {
            /*
             * Initialize
             */
            observation.price = price;
            observation.timestamp = block.timestamp.toUint32();

            emit Updated(token, price, block.timestamp);

            return true;
        }

        /*
         * Update
         */

        uint32 deltaTime = (block.timestamp - observation.timestamp).toUint32();

        if (deltaTime != 0) {
            unchecked {
                // Validate that the observation stays approximately the same for OBSERVATION_BLOCK_PERIOD blocks.
                // This limits the following manipulation:
                //   A user trades a large amount of tokens in this pool to create an invalid price, updates this
                //   accumulator, then performs a reverse trade all in the same transaction.
                // By spanning the observation over a number of blocks, arbitrageurs will take the attacker's funds
                // and stop/limit such an attack.
                if (!validateObservation(token, price)) return false;

                // Overflow is desired and results in correct functionality
                // We add the last price multiplied by the time that price was active
                accumulation.cumulativePrice += observation.price * deltaTime;

                observation.price = price;

                observation.timestamp = accumulation.timestamp = block.timestamp.toUint32();
            }

            emit Updated(token, price, block.timestamp);

            return true;
        }

        return false;
    }

    function validateObservation(address token, uint112 price) internal virtual returns (bool) {
        // Require updaters to be EOAs to limit the attack vector that this function addresses
        // Note: isContract will return false in the constructor of contracts, but since we require two observations
        //   from the same updater spanning across several blocks, the second call will always return true if the caller
        //   is a smart contract.
        require(!msg.sender.isContract() && msg.sender == tx.origin, "LiquidityAccumulator: MUST_BE_EOA");

        PendingObservation storage pendingObservation = pendingObservations[token][msg.sender];

        if (pendingObservation.blockNumber == 0) {
            // New observation (first update call), store it
            pendingObservation.blockNumber = block.number.toUint32();
            pendingObservation.price = price;

            return false; // Needs to validate this observation
        }

        // Validating observation (second update call)

        // Check if observation period has passed
        if (block.number - pendingObservation.blockNumber < OBSERVATION_BLOCK_MIN_PERIOD) return false;

        // Check if the observations are approximately the same, and that the observation has not spanned too many
        // blocks
        bool validated = block.number - pendingObservation.blockNumber <= OBSERVATION_BLOCK_MAX_PERIOD &&
            !changeThresholdSurpassed(price, pendingObservation.price, updateThreshold);

        // Validation performed. Delete the pending observation
        delete pendingObservations[token][msg.sender];

        return validated;
    }

    function changeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateTheshold
    ) internal view virtual returns (bool) {
        // Ensure a is never smaller than b
        if (a < b) {
            uint256 temp = a;
            a = b;
            b = temp;
        }

        // a >= b

        if (a == 0) {
            // a == b == 0 (since a >= b), therefore no change
            return false;
        } else if (b == 0) {
            // (a > 0 && b == 0) => change threshold passed
            // Zero to non-zero always returns true
            return true;
        }

        unchecked {
            uint256 delta = a - b; // a >= b, therefore no underflow
            uint256 preciseDelta = delta * CHANGE_PRECISION;

            // If the delta is so large that multiplying by CHANGE_PRECISION overflows, we assume that
            // the change threshold has been surpassed.
            // If our assumption is incorrect, the accumulator will be extra-up-to-date, which won't
            // really break anything, but will cost more gas in keeping this accumulator updated.
            if (preciseDelta < delta) return true;

            uint256 change = preciseDelta / b;

            return change >= updateTheshold;
        }
    }

    function fetchPrice(address token) internal view virtual returns (uint112 price);
}
