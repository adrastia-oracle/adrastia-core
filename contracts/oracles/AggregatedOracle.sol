//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../interfaces/IAggregatedOracle.sol";

import "../libraries/ObservationLibrary.sol";

contract AggregatedOracle is IAggregatedOracle {
    address[] public oracles;

    uint256 public immutable period;

    mapping(address => ObservationLibrary.Observation) public observations;

    event Updated(
        address indexed token,
        uint256 indexed timestamp,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    );

    constructor(address[] memory oracles_, uint256 period_) {
        require(oracles_.length > 0, "AggregatedOracle: No oracles provided.");

        oracles = oracles_;
        period = period_;
    }

    function quoteTokenAddress() public view virtual override returns (address) {
        revert("TODO");
    }

    function quoteTokenSymbol() public view virtual override returns (string memory) {
        revert("TODO");
    }

    function getOracles() external view virtual override returns (address[] memory) {
        return oracles;
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        uint256 deltaTime = block.timestamp - observations[token].timestamp;

        return deltaTime >= period;
    }

    function update(address token) external override returns (bool) {
        if (needsUpdate(token)) {
            bool underlyingUpdated;

            // Ensure all underlying oracles are up-to-date
            for (uint256 i = 0; i < oracles.length; ++i) {
                // We don't want any problematic underlying oracles to prevent this oracle from updating
                // so we put update in a try-catch block
                try IOracle(oracles[i]).update(token) returns (bool updated) {
                    underlyingUpdated = underlyingUpdated || updated;
                } catch Error(string memory reason) {
                    emit UpdateErrorWithReason(token, reason);
                } catch (bytes memory err) {
                    emit UpdateError(token, err);
                }
            }

            uint256 price;
            uint256 tokenLiquidity;
            uint256 quoteTokenLiquidity;
            uint256 validResponses;

            (price, tokenLiquidity, quoteTokenLiquidity, validResponses) = consultFresh(token);

            if (validResponses >= 1) {
                ObservationLibrary.Observation storage observation = observations[token];

                observation.price = price;
                observation.tokenLiquidity = tokenLiquidity;
                observation.quoteTokenLiquidity = quoteTokenLiquidity;
                observation.timestamp = block.timestamp;

                emit Updated(token, block.timestamp, price, tokenLiquidity, quoteTokenLiquidity);

                return true;
            } else emit UpdateErrorWithReason(token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

            return underlyingUpdated;
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
            uint256 quoteTokenLiquidity
        )
    {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "AggregatedOracle: MISSING_OBSERVATION");

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.quoteTokenLiquidity;
    }

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "AggregatedOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "AggregatedOracle: RATE_TOO_OLD");

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.quoteTokenLiquidity;
    }

    function consultPrice(address token) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "AggregatedOracle: MISSING_OBSERVATION");

        price = consultation.price;
    }

    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "AggregatedOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "AggregatedOracle: RATE_TOO_OLD");

        price = consultation.price;
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "AggregatedOracle: MISSING_OBSERVATION");

        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.quoteTokenLiquidity;
    }

    function consultLiquidity(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage consultation = observations[token];

        require(consultation.timestamp != 0, "AggregatedOracle: MISSING_OBSERVATION");
        require(block.timestamp <= consultation.timestamp + maxAge, "AggregatedOracle: RATE_TOO_OLD");

        tokenLiquidity = consultation.tokenLiquidity;
        quoteTokenLiquidity = consultation.quoteTokenLiquidity;
    }

    function consultFresh(address token)
        internal
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity,
            uint256 validResponses
        )
    {
        uint256 oracleCount = oracles.length;

        /*
         * Compute harmonic mean
         */

        uint256 denominator; // sum of oracleQuoteTokenLiquidity divided by oraclePrice

        for (uint256 i = 0; i < oracleCount; ++i) {
            // We don't want problematic underlying oracles to prevent us from calculating the aggregated
            // results from the other working oracles, so we use a try-catch block
            //
            // We use period * 2 as the max age just in-case the update of the particular underlying oracle failed
            // -> We don't want to use old data.
            try IOracle(oracles[i]).consult(token, period * 2) returns (
                uint256 oraclePrice,
                uint256 oracleTokenLiquidity,
                uint256 oracleQuoteTokenLiquidity
            ) {
                if (oracleQuoteTokenLiquidity != 0 && oraclePrice != 0) {
                    ++validResponses;

                    denominator += oracleQuoteTokenLiquidity / oraclePrice;

                    // These should never overflow: supply of an asset cannot be greater than uint256.max
                    tokenLiquidity += oracleTokenLiquidity;
                    quoteTokenLiquidity += oracleQuoteTokenLiquidity;
                }
            } catch Error(string memory reason) {
                emit ConsultErrorWithReason(token, reason);
            } catch (bytes memory err) {
                emit ConsultError(token, err);
            }
        }

        price = denominator == 0 ? 0 : quoteTokenLiquidity / denominator;
    }
}
