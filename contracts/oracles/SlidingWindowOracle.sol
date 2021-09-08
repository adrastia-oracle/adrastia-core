//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../interfaces/IOracle.sol";

import "../libraries/ObservationLibrary.sol";

contract SlidingWindowOracle is IOracle {
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

    constructor(
        address underlyingOracle_,
        address quoteToken_,
        uint256 period_,
        uint8 numPeriods_
    ) {
        // TODO: Ensure quote tokens match
        require(period_ != 0, "SlidingWindowOracle: INVALID_PERIOD");
        require(numPeriods_ > 1, "SlidingWindowOracle: INVALID_NUM_PERIODS");

        underlyingOracle = underlyingOracle_;
        quoteToken = quoteToken_;
        period = period_;
        numPeriods = numPeriods_;
    }

    function quoteTokenAddress() public view virtual override returns (address) {
        return quoteToken;
    }

    function quoteTokenSymbol() public view virtual override returns (string memory) {
        revert("TODO");
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        BufferMetadata storage meta = observationBufferData[token];
        if (meta.size == 0) return true;

        // We have observations, so check if enough time has passed since the last observation
        ObservationLibrary.Observation storage lastObservation = getLastObservation(token, meta);

        uint256 timeElapsed = block.timestamp - lastObservation.timestamp;

        return timeElapsed > period;
    }

    function update(address token) external override returns (bool) {
        BufferMetadata storage meta = observationBufferData[token];

        if (meta.maxSize == 0) {
            // No buffer for the token so we 'initialize' the buffer
            meta.maxSize = numPeriods;
        }

        if (needsUpdate(token)) {
            // Ensure the underlying oracle is always up-to-date
            IOracle(underlyingOracle).update(token);

            ObservationLibrary.Observation memory observation;

            (observation.price, observation.tokenLiquidity, observation.baseLiquidity) = IOracle(underlyingOracle)
                .consult(token);
            observation.timestamp = block.timestamp;

            appendBuffer(token, observation);

            ObservationLibrary.Observation storage consultation = storedConsultations[token];

            (consultation.price, consultation.tokenLiquidity, consultation.baseLiquidity) = consultFresh(token);
            consultation.timestamp = block.timestamp;

            return true;
        }

        return false;
    }

    function consult(address token)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 baseLiquidity
        )
    {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        baseLiquidity = consultation.baseLiquidity;
    }

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 baseLiquidity
        )
    {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "SlidingWindowOracle: RATE_TOO_OLD");

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        baseLiquidity = consultation.baseLiquidity;
    }

    function consultPrice(address token) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");

        price = consultation.price;
    }

    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "SlidingWindowOracle: RATE_TOO_OLD");

        price = consultation.price;
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");

        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.baseLiquidity;
    }

    function consultLiquidity(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        require(consultation.timestamp != 0, "SlidingWindowOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "SlidingWindowOracle: RATE_TOO_OLD");

        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.baseLiquidity;
    }

    function consultFresh(address token)
        internal
        view
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 baseLiquidity
        )
    {
        BufferMetadata storage meta = observationBufferData[token];
        if (meta.size == 0) return (0, 0, 0);

        mapping(uint256 => ObservationLibrary.Observation) storage buffer = observationBuffers[token];

        uint256 currentTime = block.timestamp;
        uint256 timeSum = 0;

        uint256 weightedPriceSum = 0;
        uint256 weightedTokenSum = 0;
        uint256 weightedBaseSum = 0;

        for (uint256 i = 0; i < meta.size; ++i) {
            uint256 index = (meta.start + i) % meta.maxSize;

            ObservationLibrary.Observation storage observation = buffer[index];

            uint256 timeElapsed = currentTime - observation.timestamp;
            if (timeElapsed == 0) timeElapsed = 1;

            timeSum += timeElapsed;
            weightedPriceSum += observation.price * timeElapsed;
            weightedTokenSum += observation.tokenLiquidity * timeElapsed;
            weightedBaseSum += observation.baseLiquidity * timeElapsed;
        }

        price = weightedPriceSum / timeSum;
        tokenLiquidity = weightedTokenSum / timeSum;
        baseLiquidity = weightedBaseSum / timeSum;
    }

    /**
     * Internal buffer strategies
     */

    function appendBuffer(address token, ObservationLibrary.Observation memory value) internal {
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

    function getObservations(address token) public view returns (ObservationLibrary.Observation[] memory) {
        BufferMetadata storage meta = observationBufferData[token];

        return getObservations(token, meta);
    }

    function getObservations(address token, BufferMetadata storage meta)
        internal
        view
        returns (ObservationLibrary.Observation[] memory)
    {
        ObservationLibrary.Observation[] memory observations = new ObservationLibrary.Observation[](meta.size);

        mapping(uint256 => ObservationLibrary.Observation) storage buffer = observationBuffers[token];

        for (uint256 i = 0; i < meta.size; ++i) {
            uint256 index = (meta.start + i) % meta.maxSize;

            observations[i] = buffer[index];
        }

        return observations;
    }

    function getLastObservation(address token, BufferMetadata storage meta)
        internal
        view
        returns (ObservationLibrary.Observation storage)
    {
        return observationBuffers[token][(meta.end == 0 ? meta.maxSize : meta.end) - 1];
    }

    function getFirstObservation(address token, BufferMetadata storage meta)
        internal
        view
        returns (ObservationLibrary.Observation storage)
    {
        return observationBuffers[token][meta.start];
    }
}
