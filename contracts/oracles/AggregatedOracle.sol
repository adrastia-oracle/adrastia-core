//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../interfaces/IOracle.sol";
import "../interfaces/IAggregatedOracle.sol";

import "../libraries/ObservationLibrary.sol";

import "hardhat/console.sol";

contract AggregatedOracle is IOracle, IAggregatedOracle {
    address[] public oracles;

    uint256 immutable period;

    mapping(address => ObservationLibrary.Observation) public storedConsultations;

    constructor(address[] memory oracles_, uint256 period_) {
        require(oracles_.length > 0, "AggregatedOracle: No oracles provided.");

        oracles = oracles_;
        period = period_;
    }

    function getOracles() external view virtual override returns (address[] memory) {
        return oracles;
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        uint256 deltaTime = block.timestamp - storedConsultations[token].timestamp;

        return deltaTime >= period;
    }

    function update(address token) external override {
        if (needsUpdate(token)) {
            // Ensure all underlying oracles are up-to-date
            for (uint256 i = 0; i < oracles.length; ++i) IOracle(oracles[i]).update(token);

            ObservationLibrary.Observation storage consultation = storedConsultations[token];

            (consultation.price, consultation.tokenLiquidity, consultation.baseLiquidity) = consultFresh(token);
            consultation.timestamp = block.timestamp;
        }
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

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        baseLiquidity = consultation.baseLiquidity;
    }

    function consultFresh(address token)
        internal
        view
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        require(oracles.length > 0, "No underlying oracles.");

        uint256 oracleCount = oracles.length;

        /*
         * Compute harmonic sum
         */

        uint256 numerator; // sum of weights
        uint256 denominator; // sum of weights divided by prices

        uint256 oraclePrice;
        uint256 oracleTokenLiquidity;
        uint256 oracleQuoteTokenLiquidity;

        for (uint256 i = 0; i < oracleCount; ++i) {
            (oraclePrice, oracleTokenLiquidity, oracleQuoteTokenLiquidity) = IOracle(oracles[i]).consult(token);

            if (oracleQuoteTokenLiquidity != 0 && oraclePrice != 0) {
                numerator += oracleQuoteTokenLiquidity;
                denominator += oracleQuoteTokenLiquidity / oraclePrice;

                // These should never overflow: supply of an asset cannot be greater than uint256.max
                tokenLiquidity += oracleTokenLiquidity;
                quoteTokenLiquidity += oracleQuoteTokenLiquidity;
            }
        }

        price = denominator == 0 ? 0 : numerator / denominator;
    }
}
