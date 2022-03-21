//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";

import "../interfaces/IPriceAccumulator.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract PriceAccumulator is IERC165, IPriceAccumulator {
    struct PendingObservation {
        uint256 blockNumber;
        uint256 price;
    }

    uint256 public constant OBSERVATION_BLOCK_PERIOD = 10;

    uint256 internal constant CHANGE_PRECISION_DECIMALS = 8;
    uint256 internal constant CHANGE_PRECISION = 10**CHANGE_PRECISION_DECIMALS;

    uint256 public immutable updateThreshold;
    uint256 public immutable minUpdateDelay;
    uint256 public immutable maxUpdateDelay;

    address public immutable override quoteToken;

    uint256 public immutable override changePrecision = CHANGE_PRECISION;

    mapping(address => AccumulationLibrary.PriceAccumulator) public accumulations;
    mapping(address => ObservationLibrary.PriceObservation) public observations;

    /// @notice Stores observations held for OBSERVATION_BLOCK_PERIOD before being committed to an update.
    /// @dev address(token) => address(poster) => PendingObservation
    mapping(address => mapping(address => PendingObservation)) public pendingObservations;

    event Updated(address indexed token, address indexed quoteToken, uint256 indexed timestamp, uint256 price);

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) {
        quoteToken = quoteToken_;
        updateThreshold = updateThreshold_;
        minUpdateDelay = minUpdateDelay_;
        maxUpdateDelay = maxUpdateDelay_;
    }

    function calculatePrice(
        AccumulationLibrary.PriceAccumulator calldata firstAccumulation,
        AccumulationLibrary.PriceAccumulator calldata secondAccumulation
    ) external pure virtual override returns (uint256 price) {
        require(firstAccumulation.timestamp != 0, "PriceAccumulator: TIMESTAMP_CANNOT_BE_ZERO");

        uint256 deltaTime = secondAccumulation.timestamp - firstAccumulation.timestamp;
        require(deltaTime != 0, "PriceAccumulator: DELTA_TIME_CANNOT_BE_ZERO");

        unchecked {
            // Underflow is desired and results in correct functionality
            price = (secondAccumulation.cumulativePrice - firstAccumulation.cumulativePrice) / deltaTime;
        }
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        ObservationLibrary.PriceObservation storage lastObservation = observations[token];

        uint256 deltaTime = block.timestamp - lastObservation.timestamp;
        if (deltaTime < minUpdateDelay) return false;
        // Ensures updates occur at most once every minUpdateDelay (seconds)
        else if (deltaTime >= maxUpdateDelay) return true; // Ensures updates occur (optimistically) at least once every maxUpdateDelay (seconds)

        /*
         * maxUpdateDelay > deltaTime >= minUpdateDelay
         *
         * Check if the % change in price warrants an update (saves gas vs. always updating on change)
         */

        uint256 price = fetchPrice(token);

        return changeThresholdSurpassed(price, lastObservation.price, updateThreshold);
    }

    function update(address token) external virtual override returns (bool) {
        if (needsUpdate(token)) {
            uint256 price = fetchPrice(token);

            ObservationLibrary.PriceObservation storage observation = observations[token];
            AccumulationLibrary.PriceAccumulator storage accumulation = accumulations[token];

            if (observation.timestamp == 0) {
                /*
                 * Initialize
                 */
                observation.price = price;
                observation.timestamp = block.timestamp;

                emit Updated(token, quoteToken, block.timestamp, price);

                return true;
            }

            /*
             * Update
             */

            uint256 deltaTime = block.timestamp - observation.timestamp;

            if (deltaTime != 0) {
                unchecked {
                    // Validate that the observation stays approximately the same for OBSERVATION_BLOCK_PERIOD blocks.
                    // This prevents the following manipulation:
                    //   A user trades a large amount of tokens in this pool to create an invalid price, updates this
                    //   accumulator, then performs a reverse trade all in the same transaction.
                    // By spanning the observation over a number of blocks, arbitrageurs will take the attacker's funds
                    // and stop/limit such an attack.
                    if (!validateObservation(token, price)) return false;

                    // Overflow is desired and results in correct functionality
                    // We add the last price multiplied by the time that price was active
                    accumulation.cumulativePrice += observation.price * deltaTime;

                    observation.price = price;

                    observation.timestamp = accumulation.timestamp = block.timestamp;
                }

                emit Updated(token, quoteToken, block.timestamp, price);

                return true;
            }
        }

        return false;
    }

    function getLastAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.PriceAccumulator memory)
    {
        return accumulations[token];
    }

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

        uint256 deltaTime = block.timestamp - lastObservation.timestamp;

        if (deltaTime != 0) {
            // The last observation price has existed for some time, so we add that
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the last price multiplied by the time that price was active
                accumulation.cumulativePrice += lastObservation.price * deltaTime;

                accumulation.timestamp = block.timestamp;
            }
        }
    }

    function getLastObservation(address token)
        public
        view
        virtual
        override
        returns (ObservationLibrary.PriceObservation memory)
    {
        return observations[token];
    }

    function getCurrentObservation(address token)
        public
        view
        virtual
        override
        returns (ObservationLibrary.PriceObservation memory observation)
    {
        observation.price = fetchPrice(token);
        observation.timestamp = block.timestamp;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IPriceAccumulator).interfaceId;
    }

    function validateObservation(address token, uint256 price) internal returns (bool) {
        PendingObservation storage pendingObservation = pendingObservations[token][msg.sender];

        if (pendingObservation.blockNumber == 0) {
            // New observation (first update call), store it
            pendingObservation.blockNumber = block.number;
            pendingObservation.price = price;

            return false; // Needs to validate this observation
        }

        // Validating observation (second update call)

        // Check if observation period has passed
        if (block.number - pendingObservation.blockNumber < OBSERVATION_BLOCK_PERIOD) return false;

        // Check if the observations are approximately the same
        bool validated = !changeThresholdSurpassed(price, pendingObservation.price, updateThreshold);

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

    function fetchPrice(address token) internal view virtual returns (uint256 price);
}
