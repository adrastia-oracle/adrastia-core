//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/IOracle.sol";

import "../libraries/ObservationLibrary.sol";

import "hardhat/console.sol";

contract SlidingWindowOracle is IOracle {

    using SafeMath for uint256;

    struct BufferMetadata {
        uint256 start;
        uint256 end;
        uint256 size;
        uint256 maxSize;
    }

    address public immutable underlyingOracle;

    address public immutable quoteToken;

    uint256 public immutable period;

    uint8 public immutable numPeriods;

    mapping(address => mapping(uint256 => ObservationLibrary.Observation)) public observationBuffers;

    mapping(address => BufferMetadata) public observationBufferData;

    mapping(address => ObservationLibrary.Observation) public storedConsultations;

    constructor(address underlyingOracle_, address quoteToken_, uint256 period_, uint8 numPeriods_) {
        // TODO: Ensure quote tokens match
        require(period_ != 0, "SlidingWindowOracle: INVALID_PERIOD");
        require(numPeriods_ > 1, "SlidingWindowOracle: INVALID_NUM_PERIODS");

        underlyingOracle = underlyingOracle_;
        quoteToken = quoteToken_;
        period = period_;
        numPeriods = numPeriods_;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        BufferMetadata storage meta = observationBufferData[token];
        if (meta.size == 0)
            return true;

        // We have observations, so check if enough time has passed since the last observation
        ObservationLibrary.Observation storage lastObservation = getLastObservation(token, meta);

        uint timeElapsed = block.timestamp - lastObservation.timestamp;

        return timeElapsed > period;
    }

    function update(address token) override external {
        BufferMetadata storage meta = observationBufferData[token];

        if (meta.maxSize == 0) {
            // No buffer for the token so we 'initialize' the buffer
            meta.maxSize = numPeriods;
        }

        if (needsUpdate(token)) {
            // Ensure the underlying oracle is always up-to-date
            IOracle(underlyingOracle).update(token);

            ObservationLibrary.Observation storage observation;

            (observation.price, observation.tokenLiquidity, observation.baseLiquidity) = IOracle(underlyingOracle).consult(token);
            observation.timestamp = block.timestamp;

            appendBuffer(token, observation);

            ObservationLibrary.Observation storage consultation = storedConsultations[token];

            (consultation.price, consultation.tokenLiquidity, consultation.baseLiquidity) = consultFresh(token);
            consultation.timestamp = block.timestamp;
        }
    }

    function consult(address token) override virtual public view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        baseLiquidity = consultation.baseLiquidity;
    }

    function consultFresh(address token) internal view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        BufferMetadata storage meta = observationBufferData[token];
        if (meta.size == 0)
            return (0, 0, 0);

        mapping(uint256 => ObservationLibrary.Observation) storage buffer = observationBuffers[token];

        uint256 currentTime = block.timestamp;
        uint256 timeSum = 0;

        uint256 weightedPriceSum = 0;
        uint256 weightedTokenSum = 0;
        uint256 weightedBaseSum = 0;

        for (uint256 i = 0; i < meta.size; ++i) {
            uint256 index = (meta.start + i) % meta.maxSize;

            ObservationLibrary.Observation storage observation = buffer[index];

            uint256 timeElapsed = currentTime.sub(observation.timestamp);
            if (timeElapsed == 0)
                timeElapsed = 1;

            timeSum = timeSum.add(timeElapsed);
            weightedPriceSum = weightedPriceSum.add(observation.price.mul(timeElapsed));
            weightedTokenSum = weightedTokenSum.add(observation.tokenLiquidity.mul(timeElapsed));
            weightedBaseSum = weightedBaseSum.add(observation.baseLiquidity.mul(timeElapsed));
        }

        price = weightedPriceSum.div(timeSum);
        tokenLiquidity = weightedTokenSum.div(timeSum);
        baseLiquidity = weightedBaseSum.div(timeSum);
    }

    /**
     * Internal buffer strategies
     */

    function appendBuffer(address token, ObservationLibrary.Observation storage value) internal {
        BufferMetadata storage meta = observationBufferData[token];

        observationBuffers[token][meta.end] = value;
        meta.end = (meta.end + 1) % meta.maxSize;

        if (meta.size < meta.maxSize) {
            meta.size += 1;
        } else {
            // start was just overwritten
            meta.start = (meta.start + 1) % meta.maxSize;
        }
    }

    function getObservations(address token) public view returns(ObservationLibrary.Observation[] memory) {
        BufferMetadata storage meta = observationBufferData[token];

        return getObservations(token, meta);
    }

    function getObservations(address token, BufferMetadata storage meta) internal view returns(ObservationLibrary.Observation[] memory) {
        ObservationLibrary.Observation[] memory observations = new ObservationLibrary.Observation[](meta.size);

        mapping(uint256 => ObservationLibrary.Observation) storage buffer = observationBuffers[token];

        for (uint256 i = 0; i < meta.size; ++i) {
            uint256 index = (meta.start + i) % meta.maxSize;

            observations[i] = buffer[index];
        }

        return observations;
    }

    function getLastObservation(address token, BufferMetadata storage meta) internal view returns(ObservationLibrary.Observation storage) {
        return observationBuffers[token][(meta.end == 0 ? meta.maxSize : meta.end) - 1];
    }

    function getFirstObservation(address token, BufferMetadata storage meta) internal view returns(ObservationLibrary.Observation storage) {
        return observationBuffers[token][meta.start];
    }
}