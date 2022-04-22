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

    uint256 internal constant CHANGE_PRECISION_DECIMALS = 8;
    uint256 internal constant CHANGE_PRECISION = 10**CHANGE_PRECISION_DECIMALS;

    uint256 public immutable updateThreshold;
    uint256 public immutable minUpdateDelay;
    uint256 public immutable maxUpdateDelay;

    uint256 public immutable override changePrecision = CHANGE_PRECISION;

    mapping(address => AccumulationLibrary.PriceAccumulator) public accumulations;
    mapping(address => ObservationLibrary.PriceObservation) public observations;

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

    /// @notice Checks if this accumulator needs an update by checking the time since the last update and the change in
    ///   liquidities.
    /// @param data The encoded address of the token for which to perform the update.
    /// @inheritdoc IUpdateable
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

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

    /// @param data The encoded address of the token for which to perform the update.
    /// @inheritdoc IUpdateable
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        return needsUpdate(data);
    }

    /// @notice Updates the accumulator.
    /// @dev Must be called by an EOA to limit the attack vector, unless it's the first observation for a token.
    /// @param data The encoded address of the token for which to perform the update.
    /// @return updated True if anything (other than a pending observation) was updated; false otherwise.
    function update(bytes memory data) public virtual override returns (bool) {
        if (needsUpdate(data)) return performUpdate(data);

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

    function performUpdate(bytes memory data) internal virtual returns (bool) {
        address token = abi.decode(data, (address));

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
                if (!validateObservation(data, price)) return false;

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

    function validateObservation(bytes memory updateData, uint112 price) internal virtual returns (bool) {
        require(msg.sender == tx.origin, "PriceAccumulator: MUST_BE_EOA");

        // Silence un-used variable warnings
        updateData;
        price;

        return true;
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
