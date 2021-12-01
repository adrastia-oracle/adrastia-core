//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "./PeriodicOracle.sol";
import "../interfaces/IAggregatedOracle.sol";

contract AggregatedOracle is IAggregatedOracle, PeriodicOracle {
    struct TokenSpecificOracle {
        address token;
        address oracle;
    }

    address[] public oracles;

    mapping(address => address[]) public tokenSpecificOracles;

    mapping(address => uint8) public oracleQuoteTokenDecimals;

    string internal _quoteTokenName;
    address internal _quoteTokenAddress;
    string internal _quoteTokenSymbol;
    uint8 internal _quoteTokenDecimals;

    mapping(address => bool) private oracleExists;
    mapping(address => mapping(address => bool)) private oracleForExists;

    constructor(
        string memory quoteTokenName_,
        address quoteTokenAddress_,
        string memory quoteTokenSymbol_,
        uint8 quoteTokenDecimals_,
        address[] memory oracles_,
        TokenSpecificOracle[] memory tokenSpecificOracles_,
        uint256 period_
    ) PeriodicOracle(address(0), period_) {
        require(oracles_.length > 0 || tokenSpecificOracles_.length > 0, "AggregatedOracle: MISSING_ORACLES");

        for (uint256 i = 0; i < oracles_.length; ++i) {
            require(!oracleExists[oracles_[i]], "AggregatedOracle: DUPLICATE_ORACLE");

            oracleExists[oracles_[i]] = true;

            oracleQuoteTokenDecimals[oracles_[i]] = IOracle(oracles_[i]).quoteTokenDecimals();
        }

        // We store quote token information like this just-in-case the underlying oracles use different quote tokens.
        // Note: All underlying quote tokens must be loosly equal (i.e. equal in value and in number of decimals).
        _quoteTokenName = quoteTokenName_;
        _quoteTokenAddress = quoteTokenAddress_;
        _quoteTokenSymbol = quoteTokenSymbol_;
        _quoteTokenDecimals = quoteTokenDecimals_;

        oracles = oracles_;

        for (uint256 i = 0; i < tokenSpecificOracles_.length; ++i) {
            TokenSpecificOracle memory oracle = tokenSpecificOracles_[i];

            require(!oracleExists[oracle.oracle], "AggregatedOracle: DUPLICATE_ORACLE");
            require(!oracleForExists[oracle.token][oracle.oracle], "AggregatedOracle: DUPLICATE_ORACLE");

            tokenSpecificOracles[oracle.token].push(oracle.oracle);

            oracleForExists[oracle.token][oracle.oracle] = true;

            oracleQuoteTokenDecimals[oracle.oracle] = IOracle(oracle.oracle).quoteTokenDecimals();
        }
    }

    function quoteTokenName() public view virtual override(IOracle, AbstractOracle) returns (string memory) {
        return _quoteTokenName;
    }

    function quoteTokenAddress() public view virtual override(IOracle, AbstractOracle) returns (address) {
        return _quoteTokenAddress;
    }

    function quoteTokenSymbol() public view virtual override(IOracle, AbstractOracle) returns (string memory) {
        return _quoteTokenSymbol;
    }

    function quoteTokenDecimals() public view virtual override(IOracle, AbstractOracle) returns (uint8) {
        return _quoteTokenDecimals;
    }

    function getOracles() external view virtual override returns (address[] memory) {
        return oracles;
    }

    function getOraclesFor(address token) external view virtual override returns (address[] memory) {
        address[] memory _tokenSpecificOracles = tokenSpecificOracles[token];
        address[] memory _oracles = oracles;

        address[] memory allOracles = new address[](_oracles.length + _tokenSpecificOracles.length);

        // Add the general oracles
        for (uint256 i = 0; i < _oracles.length; ++i) allOracles[i] = _oracles[i];

        // Add the token specific oracles
        for (uint256 i = 0; i < _tokenSpecificOracles.length; ++i)
            allOracles[_oracles.length + i] = _tokenSpecificOracles[i];

        return allOracles;
    }

    function _update(address token) internal override returns (bool) {
        bool underlyingUpdated;

        // Ensure all underlying oracles are up-to-date
        for (uint256 j = 0; j < 2; ++j) {
            address[] memory _oracles;

            if (j == 0) _oracles = oracles;
            else _oracles = tokenSpecificOracles[token];

            for (uint256 i = 0; i < _oracles.length; ++i) {
                // We don't want any problematic underlying oracles to prevent this oracle from updating
                // so we put update in a try-catch block
                try IOracle(_oracles[i]).update(token) returns (bool updated) {
                    underlyingUpdated = underlyingUpdated || updated;
                } catch Error(string memory reason) {
                    emit UpdateErrorWithReason(_oracles[i], token, reason);
                } catch (bytes memory err) {
                    emit UpdateError(_oracles[i], token, err);
                }
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

            emit Updated(token, _quoteTokenAddress, block.timestamp, price, tokenLiquidity, quoteTokenLiquidity);

            return true;
        } else emit UpdateErrorWithReason(address(this), token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

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
        uint256 qtDecimals = _quoteTokenDecimals;

        /*
         * Compute harmonic mean
         */

        uint256 denominator; // sum of oracleQuoteTokenLiquidity divided by oraclePrice

        for (uint256 j = 0; j < 2; ++j) {
            address[] memory _oracles;

            if (j == 0) _oracles = oracles;
            else _oracles = tokenSpecificOracles[token];

            for (uint256 i = 0; i < _oracles.length; ++i) {
                // We don't want problematic underlying oracles to prevent us from calculating the aggregated
                // results from the other working oracles, so we use a try-catch block
                //
                // We use period * 2 as the max age just in-case the update of the particular underlying oracle failed
                // -> We don't want to use old data.w
                try IOracle(_oracles[i]).consult(token, period * 2) returns (
                    uint256 oraclePrice,
                    uint256 oracleTokenLiquidity,
                    uint256 oracleQuoteTokenLiquidity
                ) {
                    if (oracleQuoteTokenLiquidity != 0 && oraclePrice != 0) {
                        uint256 decimals = oracleQuoteTokenDecimals[_oracles[i]];

                        ++validResponses;

                        // Fix differing quote token decimal places
                        if (decimals < qtDecimals) {
                            // Scale up
                            uint256 scalar = 10**(qtDecimals - decimals);

                            oraclePrice *= scalar;
                            oracleQuoteTokenLiquidity *= scalar;
                        } else if (decimals > qtDecimals) {
                            // Scale down
                            uint256 scalar = 10**(decimals - qtDecimals);

                            oraclePrice /= scalar;
                            oracleQuoteTokenLiquidity /= scalar;
                        }

                        denominator += oracleQuoteTokenLiquidity / oraclePrice;

                        // These should never overflow: supply of an asset cannot be greater than uint256.max
                        tokenLiquidity += oracleTokenLiquidity;
                        quoteTokenLiquidity += oracleQuoteTokenLiquidity;
                    }
                } catch Error(string memory reason) {
                    emit ConsultErrorWithReason(oracles[i], token, reason);
                } catch (bytes memory err) {
                    emit ConsultError(oracles[i], token, err);
                }
            }
        }

        price = denominator == 0 ? 0 : quoteTokenLiquidity / denominator;
    }
}
