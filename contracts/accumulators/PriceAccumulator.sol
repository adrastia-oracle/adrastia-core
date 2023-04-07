//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "./AbstractAccumulator.sol";
import "../interfaces/IPriceAccumulator.sol";
import "../interfaces/IPriceOracle.sol";
import "../libraries/ObservationLibrary.sol";
import "../libraries/AddressLibrary.sol";
import "../libraries/SafeCastExt.sol";
import "../utils/SimpleQuotationMetadata.sol";

abstract contract PriceAccumulator is
    IERC165,
    IPriceAccumulator,
    IPriceOracle,
    AbstractAccumulator,
    SimpleQuotationMetadata
{
    using AddressLibrary for address;
    using SafeCast for uint256;
    using SafeCastExt for uint256;

    uint256 public immutable minUpdateDelay;
    uint256 public immutable maxUpdateDelay;

    mapping(address => AccumulationLibrary.PriceAccumulator) public accumulations;
    mapping(address => ObservationLibrary.PriceObservation) public observations;

    /**
     * @notice Emitted when the observed price is validated against a user (updater) provided price.
     * @param token The token that the price validation is for.
     * @param observedPrice The observed price from the on-chain data source.
     * @param providedPrice The price provided externally by the user (updater).
     * @param timestamp The timestamp of the block that the validation was performed in.
     * @param providedTimestamp The timestamp of the block that the provided price was observed in.
     * @param succeeded True if the observed price closely matches the provided price; false otherwise.
     */
    event ValidationPerformed(
        address indexed token,
        uint256 observedPrice,
        uint256 providedPrice,
        uint256 timestamp,
        uint256 providedTimestamp,
        bool succeeded
    );

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) AbstractAccumulator(updateThreshold_) SimpleQuotationMetadata(quoteToken_) {
        require(maxUpdateDelay_ >= minUpdateDelay_, "PriceAccumulator: INVALID_UPDATE_DELAYS");

        minUpdateDelay = minUpdateDelay_;
        maxUpdateDelay = maxUpdateDelay_;
    }

    /// @inheritdoc IAccumulator
    function heartbeat() external view virtual override returns (uint256) {
        return maxUpdateDelay;
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
            price = uint256((secondAccumulation.cumulativePrice - firstAccumulation.cumulativePrice) / deltaTime)
                .toUint112();
        }
    }

    /// @inheritdoc IAccumulator
    function changeThresholdSurpassed(
        bytes memory data,
        uint256 changeThreshold
    ) public view virtual override returns (bool) {
        uint256 price = fetchPrice(data);
        address token = abi.decode(data, (address));

        ObservationLibrary.PriceObservation storage lastObservation = observations[token];

        return changeThresholdSurpassed(price, lastObservation.price, changeThreshold);
    }

    /// @notice Checks if this accumulator needs an update by checking the time since the last update and the change in
    ///   liquidities.
    /// @param data The encoded address of the token for which to perform the update.
    /// @inheritdoc IUpdateable
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        uint256 deltaTime = timeSinceLastUpdate(data);
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
        return updateThresholdSurpassed(data);
    }

    /// @param data The encoded address of the token for which to perform the update.
    /// @inheritdoc IUpdateable
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        return needsUpdate(data);
    }

    /// @notice Updates the accumulator for a specific token.
    /// @dev Must be called by an EOA to limit the attack vector, unless it's the first observation for a token.
    /// @param data Encoding of the token address followed by the expected price.
    /// @return updated True if anything was updated; false otherwise.
    function update(bytes memory data) public virtual override returns (bool) {
        if (needsUpdate(data)) return performUpdate(data);

        return false;
    }

    /// @param data The encoded address of the token for which the update relates to.
    /// @inheritdoc IUpdateable
    function lastUpdateTime(bytes memory data) public view virtual override returns (uint256) {
        address token = abi.decode(data, (address));

        return observations[token].timestamp;
    }

    /// @param data The encoded address of the token for which the update relates to.
    /// @inheritdoc IUpdateable
    function timeSinceLastUpdate(bytes memory data) public view virtual override returns (uint256) {
        return block.timestamp - lastUpdateTime(data);
    }

    /// @inheritdoc IPriceAccumulator
    function getLastAccumulation(
        address token
    ) public view virtual override returns (AccumulationLibrary.PriceAccumulator memory) {
        return accumulations[token];
    }

    /// @inheritdoc IPriceAccumulator
    function getCurrentAccumulation(
        address token
    ) public view virtual override returns (AccumulationLibrary.PriceAccumulator memory accumulation) {
        ObservationLibrary.PriceObservation storage lastObservation = observations[token];
        require(lastObservation.timestamp != 0, "PriceAccumulator: UNINITIALIZED");

        accumulation = accumulations[token]; // Load last accumulation

        uint32 deltaTime = (block.timestamp - lastObservation.timestamp).toUint32();

        if (deltaTime != 0) {
            // The last observation price has existed for some time, so we add that
            uint224 timeWeightedPrice = uint224(lastObservation.price) * deltaTime;
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the last price multiplied by the time that price was active
                accumulation.cumulativePrice += timeWeightedPrice;
            }
            accumulation.timestamp = block.timestamp.toUint32();
        }
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, SimpleQuotationMetadata, AbstractAccumulator) returns (bool) {
        return
            interfaceId == type(IPriceAccumulator).interfaceId ||
            interfaceId == type(IPriceOracle).interfaceId ||
            interfaceId == type(IUpdateable).interfaceId ||
            SimpleQuotationMetadata.supportsInterface(interfaceId) ||
            AbstractAccumulator.supportsInterface(interfaceId);
    }

    /// @inheritdoc IPriceOracle
    function consultPrice(address token) public view virtual override returns (uint112 price) {
        if (token == quoteTokenAddress()) return uint112(10 ** quoteTokenDecimals());

        ObservationLibrary.PriceObservation storage observation = observations[token];

        require(observation.timestamp != 0, "PriceAccumulator: MISSING_OBSERVATION");

        return observation.price;
    }

    /// @param maxAge The maximum age of the quotation, in seconds. If 0, fetches the real-time price.
    /// @inheritdoc IPriceOracle
    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint112 price) {
        if (token == quoteTokenAddress()) return uint112(10 ** quoteTokenDecimals());

        if (maxAge == 0) return fetchPrice(abi.encode(token));

        ObservationLibrary.PriceObservation storage observation = observations[token];

        require(observation.timestamp != 0, "PriceAccumulator: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "PriceAccumulator: RATE_TOO_OLD");

        return observation.price;
    }

    function performUpdate(bytes memory data) internal virtual returns (bool) {
        uint112 price = fetchPrice(data);
        address token = abi.decode(data, (address));

        // If the observation fails validation, do not update anything
        if (!validateObservation(data, price)) return false;

        ObservationLibrary.PriceObservation storage observation = observations[token];
        AccumulationLibrary.PriceAccumulator storage accumulation = accumulations[token];

        if (observation.timestamp == 0) {
            /*
             * Initialize
             */
            observation.price = price;
            observation.timestamp = accumulation.timestamp = block.timestamp.toUint32();

            emit Updated(token, price, block.timestamp);

            return true;
        }

        /*
         * Update
         */

        uint32 deltaTime = (block.timestamp - observation.timestamp).toUint32();

        if (deltaTime != 0) {
            uint224 timeWeightedPrice = uint224(observation.price) * deltaTime;
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the last price multiplied by the time that price was active
                accumulation.cumulativePrice += timeWeightedPrice;
            }
            observation.price = price;
            observation.timestamp = accumulation.timestamp = block.timestamp.toUint32();

            emit Updated(token, price, block.timestamp);

            return true;
        }

        return false;
    }

    /// @notice Requires the message sender of an update to not be a smart contract.
    /// @dev Can be overridden to disable this requirement.
    function validateObservationRequireEoa() internal virtual {
        // Message sender should never be a smart contract. Smart contracts can use flash attacks to manipulate data.
        require(msg.sender == tx.origin, "PriceAccumulator: MUST_BE_EOA");
    }

    function validateObservationAllowedChange(address) internal virtual returns (uint256) {
        // Allow the price to change by half of the update threshold
        return updateThreshold / 2;
    }

    function validateAllowedTimeDifference() internal virtual returns (uint32) {
        return 5 minutes; // Allow time for the update to be mined
    }

    function validateObservationTime(uint32 providedTimestamp) internal virtual returns (bool) {
        uint32 allowedTimeDifference = validateAllowedTimeDifference();

        return
            block.timestamp <= providedTimestamp + allowedTimeDifference &&
            block.timestamp >= providedTimestamp - 10 seconds; // Allow for some clock drift
    }

    function validateObservation(bytes memory updateData, uint112 price) internal virtual returns (bool) {
        validateObservationRequireEoa();

        // Extract provided price
        // The message sender should call consultPrice immediately before calling the update function, passing
        //   the returned value into the update data.
        // We could also use this to anchor the price to an off-chain price
        (address token, uint112 pPrice, uint32 pTimestamp) = abi.decode(updateData, (address, uint112, uint32));

        uint256 allowedChangeThreshold = validateObservationAllowedChange(token);

        // We require the price to not change by more than the threshold above
        // This check limits the ability of MEV and flashbots from manipulating data
        bool priceValidated = !changeThresholdSurpassed(price, pPrice, allowedChangeThreshold);
        bool timeValidated = validateObservationTime(pTimestamp);

        bool validated = priceValidated && timeValidated;

        emit ValidationPerformed(token, price, pPrice, block.timestamp, pTimestamp, validated);

        return validated;
    }

    function fetchPrice(bytes memory data) internal view virtual returns (uint112 price);
}
