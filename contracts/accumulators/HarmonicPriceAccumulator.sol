//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./PriceAccumulator.sol";

abstract contract HarmonicPriceAccumulator is PriceAccumulator {
    using SafeCast for uint256;
    using SafeCastExt for uint256;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

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
            price = (
                ((uint256(deltaTime) << 192) / (secondAccumulation.cumulativePrice - firstAccumulation.cumulativePrice))
            ).toUint112();
        }
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

        // Shift deltaTime to the left by 192 bits to allow for precise division by a uint112 price
        uint256 deltaTime = (block.timestamp - lastObservation.timestamp) << 192;

        uint256 price = lastObservation.price;
        if (price == 0) {
            // Prevent division by zero
            price = 1;
        }

        if (deltaTime != 0) {
            // The last observation price has existed for some time, so we add that
            uint224 timeWeightedPrice = (deltaTime / price).toUint224();
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the reciprocal of the last price multiplied by the time that price was active
                accumulation.cumulativePrice += timeWeightedPrice;
            }
            accumulation.timestamp = block.timestamp.toUint32();
        }
    }

    function performUpdate(bytes memory data) internal virtual override returns (bool) {
        address token = abi.decode(data, (address));

        uint112 price = fetchPrice(token);

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

        // Shift deltaTime to the left by 192 bits to allow for precise division by a uint112 price
        uint256 deltaTime = (block.timestamp - observation.timestamp) << 192;

        uint256 oPrice = observation.price;
        if (oPrice == 0) {
            // Prevent division by zero
            oPrice = 1;
        }

        if (deltaTime != 0) {
            uint224 timeWeightedPrice = (deltaTime / oPrice).toUint224();
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
}
