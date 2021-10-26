//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "./PeriodicOracle.sol";
import "../interfaces/IAggregatedOracle.sol";

contract AggregatedOracle is IAggregatedOracle, PeriodicOracle {
    address[] public oracles;

    event Updated(
        address indexed token,
        uint256 indexed timestamp,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    );

    constructor(address[] memory oracles_, uint256 period_) PeriodicOracle(address(0), period_) {
        require(oracles_.length > 0, "AggregatedOracle: No oracles provided.");

        oracles = oracles_;
    }

    function quoteTokenAddress() public view virtual override(IOracle, AbstractOracle) returns (address) {
        revert("TODO");
    }

    function quoteTokenSymbol() public view virtual override(IOracle, AbstractOracle) returns (string memory) {
        revert("TODO");
    }

    function getOracles() external view virtual override returns (address[] memory) {
        return oracles;
    }

    function _update(address token) internal override returns (bool) {
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
