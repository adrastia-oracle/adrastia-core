//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@prb/math/contracts/PRBMathUD60x18.sol";

import "./PriceAccumulator.sol";

abstract contract GeometricPriceAccumulator is PriceAccumulator {
    using PRBMathUD60x18 for uint256;
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
            price = uint256((secondAccumulation.cumulativePrice - firstAccumulation.cumulativePrice) / deltaTime)
                .exp()
                .toUint()
                .toUint112();
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

        uint32 deltaTime = (block.timestamp - lastObservation.timestamp).toUint32();

        if (deltaTime != 0) {
            // The last observation price has existed for some time, so we add that
            uint224 timeWeightedPrice = (uint256(lastObservation.price).fromUint().ln() * deltaTime).toUint224();
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the natural log of the last price multiplied by the time that price was active
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

        uint32 deltaTime = (block.timestamp - observation.timestamp).toUint32();

        if (deltaTime != 0) {
            uint224 timeWeightedPrice = (uint256(observation.price).fromUint().ln() * deltaTime).toUint224();
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the natural log of the last price multiplied by the time that price was active
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
