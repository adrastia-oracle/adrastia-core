//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./IOracleAggregator.sol";
import "./AbstractOracle.sol";
import "./HistoricalOracle.sol";
import "../interfaces/IOracle.sol";
import "../utils/ExplicitQuotationMetadata.sol";
import "../strategies/validation/IValidationStrategy.sol";

abstract contract AbstractAggregatorOracle is
    IOracleAggregator,
    AbstractOracle,
    HistoricalOracle,
    ExplicitQuotationMetadata
{
    struct TokenSpecificOracle {
        address token;
        address oracle;
    }

    IAggregationStrategy public immutable override aggregationStrategy;

    IValidationStrategy public immutable validationStrategy;

    /// @notice One whole unit of the quote token, in the quote token's smallest denomination.
    uint256 internal immutable _quoteTokenWholeUnit;

    uint8 internal immutable _liquidityDecimals;

    Oracle[] internal oracles;
    mapping(address => Oracle[]) internal tokenSpecificOracles;

    mapping(address => bool) private oracleExists;
    mapping(address => mapping(address => bool)) private oracleForExists;

    /// @notice Emitted when an underlying oracle (or this oracle) throws an update error with a reason.
    /// @param oracle The address or the oracle throwing the error.
    /// @param token The token for which the oracle is throwing the error.
    /// @param reason The reason for or description of the error.
    event UpdateErrorWithReason(address indexed oracle, address indexed token, string reason);

    /// @notice Emitted when an underlying oracle (or this oracle) throws an update error without a reason.
    /// @param oracle The address or the oracle throwing the error.
    /// @param token The token for which the oracle is throwing the error.
    /// @param err Data corresponding with a low level error being thrown.
    event UpdateError(address indexed oracle, address indexed token, bytes err);

    struct AbstractAggregatorOracleParams {
        IAggregationStrategy aggregationStrategy;
        IValidationStrategy validationStrategy;
        string quoteTokenName;
        address quoteTokenAddress;
        string quoteTokenSymbol;
        uint8 quoteTokenDecimals;
        uint8 liquidityDecimals;
        address[] oracles;
        TokenSpecificOracle[] tokenSpecificOracles;
    }

    constructor(
        AbstractAggregatorOracleParams memory params
    )
        HistoricalOracle(1)
        AbstractOracle(params.quoteTokenAddress)
        ExplicitQuotationMetadata(
            params.quoteTokenName,
            params.quoteTokenAddress,
            params.quoteTokenSymbol,
            params.quoteTokenDecimals
        )
    {
        require(
            params.oracles.length > 0 || params.tokenSpecificOracles.length > 0,
            "AbstractAggregatorOracle: MISSING_ORACLES"
        );
        if (
            address(params.validationStrategy) != address(0) &&
            params.validationStrategy.quoteTokenDecimals() != params.quoteTokenDecimals
        ) {
            revert("AbstractAggregatorOracle: QUOTE_TOKEN_DECIMALS_MISMATCH");
        }

        aggregationStrategy = params.aggregationStrategy;
        validationStrategy = params.validationStrategy;

        _quoteTokenWholeUnit = 10 ** params.quoteTokenDecimals;

        _liquidityDecimals = params.liquidityDecimals;

        // Setup general oracles
        for (uint256 i = 0; i < params.oracles.length; ++i) {
            require(!oracleExists[params.oracles[i]], "AbstractAggregatorOracle: DUPLICATE_ORACLE");

            oracleExists[params.oracles[i]] = true;

            oracles.push(
                Oracle({
                    oracle: params.oracles[i],
                    priceDecimals: IOracle(params.oracles[i]).quoteTokenDecimals(),
                    liquidityDecimals: IOracle(params.oracles[i]).liquidityDecimals()
                })
            );
        }

        // Setup token-specific oracles
        for (uint256 i = 0; i < params.tokenSpecificOracles.length; ++i) {
            TokenSpecificOracle memory oracle = params.tokenSpecificOracles[i];

            require(!oracleExists[oracle.oracle], "AbstractAggregatorOracle: DUPLICATE_ORACLE");
            require(!oracleForExists[oracle.token][oracle.oracle], "AbstractAggregatorOracle: DUPLICATE_ORACLE");

            oracleForExists[oracle.token][oracle.oracle] = true;

            tokenSpecificOracles[oracle.token].push(
                Oracle({
                    oracle: oracle.oracle,
                    priceDecimals: IOracle(oracle.oracle).quoteTokenDecimals(),
                    liquidityDecimals: IOracle(oracle.oracle).liquidityDecimals()
                })
            );
        }
    }

    /// @inheritdoc IOracleAggregator
    function getOracles(address token) external view virtual override returns (Oracle[] memory) {
        return _getOracles(token);
    }

    /// @inheritdoc ExplicitQuotationMetadata
    function quoteTokenName()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, IQuoteToken, SimpleQuotationMetadata)
        returns (string memory)
    {
        return ExplicitQuotationMetadata.quoteTokenName();
    }

    /// @inheritdoc ExplicitQuotationMetadata
    function quoteTokenAddress()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, IQuoteToken, SimpleQuotationMetadata)
        returns (address)
    {
        return ExplicitQuotationMetadata.quoteTokenAddress();
    }

    /// @inheritdoc ExplicitQuotationMetadata
    function quoteTokenSymbol()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, IQuoteToken, SimpleQuotationMetadata)
        returns (string memory)
    {
        return ExplicitQuotationMetadata.quoteTokenSymbol();
    }

    /// @inheritdoc ExplicitQuotationMetadata
    function quoteTokenDecimals()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, IQuoteToken, SimpleQuotationMetadata)
        returns (uint8)
    {
        return ExplicitQuotationMetadata.quoteTokenDecimals();
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ExplicitQuotationMetadata, AbstractOracle) returns (bool) {
        return
            interfaceId == type(IHistoricalOracle).interfaceId ||
            interfaceId == type(IOracleAggregator).interfaceId ||
            ExplicitQuotationMetadata.supportsInterface(interfaceId) ||
            AbstractOracle.supportsInterface(interfaceId);
    }

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        if (!needsUpdate(data)) {
            return false;
        }

        if (canUpdateUnderlyingOracles(data)) {
            return true;
        }

        address token = abi.decode(data, (address));

        (, uint256 validResponses) = aggregateUnderlying(token, calculateMaxAge());

        // Only return true if we have reached the minimum number of valid underlying oracle consultations
        return validResponses >= minimumResponses();
    }

    /// @inheritdoc IOracle
    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function getLatestObservation(
        address token
    ) public view virtual override returns (ObservationLibrary.Observation memory observation) {
        BufferMetadata storage meta = observationBufferMetadata[token];

        if (meta.size == 0) {
            // If the buffer is empty, return the default observation
            return ObservationLibrary.Observation({price: 0, tokenLiquidity: 0, quoteTokenLiquidity: 0, timestamp: 0});
        }

        return observationBuffers[token][meta.end];
    }

    /// @notice Checks if any of the underlying oracles for the token need to be updated.
    /// @dev This function is used to determine if the aggregator can be updated by updating one of the underlying
    /// oracles. Please ensure updateUnderlyingOracles will update the underlying oracles if this function returns true.
    /// @param data The encoded token address, along with any additional data required by the oracle.
    /// @return True if any of the underlying oracles can be updated, false otherwise.
    function canUpdateUnderlyingOracles(bytes memory data) internal view virtual returns (bool) {
        address token = abi.decode(data, (address));

        // Ensure all underlying oracles are up-to-date
        Oracle[] memory theOracles = _getOracles(token);
        for (uint256 i = 0; i < theOracles.length; ++i) {
            if (IOracle(theOracles[i].oracle).canUpdate(data)) {
                // We can update one of the underlying oracles
                return true;
            }
        }

        return false;
    }

    /// @notice Updates the underlying oracles for the token.
    /// @dev This function is used to update the underlying oracles before consulting them.
    /// @param data The encoded token address, along with any additional data required by the oracle.
    /// @return True if any of the underlying oracles were updated, false otherwise.
    function updateUnderlyingOracles(bytes memory data) internal virtual returns (bool) {
        bool underlyingUpdated;
        address token = abi.decode(data, (address));

        // Ensure all underlying oracles are up-to-date
        Oracle[] memory theOracles = _getOracles(token);
        for (uint256 i = 0; i < theOracles.length; ++i) {
            // We don't want any problematic underlying oracles to prevent this oracle from updating
            // so we put update in a try-catch block
            try IOracle(theOracles[i].oracle).update(data) returns (bool updated) {
                underlyingUpdated = underlyingUpdated || updated;
            } catch Error(string memory reason) {
                emit UpdateErrorWithReason(theOracles[i].oracle, token, reason);
            } catch (bytes memory err) {
                emit UpdateError(theOracles[i].oracle, token, err);
            }
        }

        return underlyingUpdated;
    }

    function _getOracles(address token) internal view virtual returns (Oracle[] memory) {
        Oracle[] memory generalOracles = oracles;
        Oracle[] memory specificOracles = tokenSpecificOracles[token];

        uint256 generalOraclesCount = generalOracles.length;
        uint256 specificOraclesCount = specificOracles.length;

        Oracle[] memory allOracles = new Oracle[](generalOraclesCount + specificOraclesCount);

        // Add the general oracles
        for (uint256 i = 0; i < generalOraclesCount; ++i) allOracles[i] = generalOracles[i];

        // Add the token specific oracles
        for (uint256 i = 0; i < specificOraclesCount; ++i) allOracles[generalOraclesCount + i] = specificOracles[i];

        return allOracles;
    }

    function performUpdate(bytes memory data) internal virtual returns (bool) {
        bool underlyingUpdated = updateUnderlyingOracles(data);

        address token = abi.decode(data, (address));

        (ObservationLibrary.Observation memory observation, uint256 validResponses) = aggregateUnderlying(
            token,
            calculateMaxAge()
        );

        if (validResponses >= minimumResponses()) {
            push(token, observation);

            return true;
        } else emit UpdateErrorWithReason(address(this), token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        return underlyingUpdated;
    }

    /**
     * @notice The minimum number of valid underlying oracle consultations required to perform an update.
     */
    function minimumResponses() internal view virtual returns (uint256) {
        return 1;
    }

    /**
     * @notice Calculates the maximum age of the underlying oracles' responses when updating this oracle's observation.
     * @dev We use this to prevent old data from skewing our observations. Underlying oracles must update at least as
     *   frequently as this oracle does.
     * @return maxAge The maximum age of underlying oracles' responses, in seconds.
     */
    function calculateMaxAge() internal view virtual returns (uint256);

    function aggregateUnderlying(
        address token,
        uint256 maxAge
    ) internal view returns (ObservationLibrary.Observation memory result, uint256 validResponses) {
        uint256 pDecimals = quoteTokenDecimals();
        uint256 lDecimals = liquidityDecimals();

        Oracle[] memory theOracles = _getOracles(token);
        ObservationLibrary.Observation[] memory observations = new ObservationLibrary.Observation[](theOracles.length);

        uint256 oPrice;
        uint256 oTokenLiquidity;
        uint256 oQuoteTokenLiquidity;

        uint256 oPriceDecimals;
        uint256 oLiquidityDecimals;

        for (uint256 i = 0; i < theOracles.length; ++i) {
            // We don't want problematic underlying oracles to prevent us from calculating the aggregated
            // results from the other working oracles, so we use a try-catch block.
            try IOracle(theOracles[i].oracle).consult(token, maxAge) returns (
                uint112 _price,
                uint112 _tokenLiquidity,
                uint112 _quoteTokenLiquidity
            ) {
                // Promote returned data to uint256 to prevent scaling up from overflowing
                oPrice = _price;
                oTokenLiquidity = _tokenLiquidity;
                oQuoteTokenLiquidity = _quoteTokenLiquidity;
            } catch Error(string memory) {
                continue;
            } catch (bytes memory) {
                continue;
            }

            if (oPrice <= 1 || oTokenLiquidity <= 1 || oQuoteTokenLiquidity <= 1) {
                // Reject consultations where the price, token liquidity, or quote token liquidity is 0 or 1
                // These values are typically reserved for errors and zero liquidity
                continue;
            }

            // Fix differing quote token decimal places (for price)
            oPriceDecimals = theOracles[i].priceDecimals;
            if (oPriceDecimals < pDecimals) {
                // Scale up
                uint256 scalar = 10 ** (pDecimals - oPriceDecimals);

                oPrice *= scalar;
            } else if (oPriceDecimals > pDecimals) {
                // Scale down
                uint256 scalar = 10 ** (oPriceDecimals - pDecimals);

                oPrice /= scalar;
            }

            // Fix differing liquidity decimal places
            oLiquidityDecimals = theOracles[i].liquidityDecimals;
            if (oLiquidityDecimals < lDecimals) {
                // Scale up
                uint256 scalar = 10 ** (lDecimals - oLiquidityDecimals);

                oTokenLiquidity *= scalar;
                oQuoteTokenLiquidity *= scalar;
            } else if (oLiquidityDecimals > lDecimals) {
                // Scale down
                uint256 scalar = 10 ** (oLiquidityDecimals - lDecimals);

                oTokenLiquidity /= scalar;
                oQuoteTokenLiquidity /= scalar;
            }

            if (
                // Check that the values are not zero
                oPrice != 0 &&
                oTokenLiquidity != 0 &&
                oQuoteTokenLiquidity != 0 &&
                // Check that the values are not too large
                oPrice <= type(uint112).max &&
                oTokenLiquidity <= type(uint112).max &&
                oQuoteTokenLiquidity <= type(uint112).max
            ) {
                ObservationLibrary.Observation memory observation = ObservationLibrary.Observation({
                    price: uint112(oPrice),
                    tokenLiquidity: uint112(oTokenLiquidity),
                    quoteTokenLiquidity: uint112(oQuoteTokenLiquidity),
                    timestamp: 0 // Not used
                });

                if (address(validationStrategy) == address(0) || validationStrategy.validateObservation(observation)) {
                    // The observation is valid, so we add it to the array
                    observations[validResponses++] = observation;
                }
            }
        }

        if (validResponses == 0) {
            return (
                ObservationLibrary.Observation({price: 0, tokenLiquidity: 0, quoteTokenLiquidity: 0, timestamp: 0}),
                0
            );
        }

        result = aggregationStrategy.aggregateObservations(observations, 0, validResponses - 1);
    }

    /// @inheritdoc AbstractOracle
    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        (ObservationLibrary.Observation memory result, uint256 validResponses) = aggregateUnderlying(token, 0);

        uint256 minResponses = minimumResponses();
        require(validResponses >= minResponses, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        price = result.price;
        tokenLiquidity = result.tokenLiquidity;
        quoteTokenLiquidity = result.quoteTokenLiquidity;
    }
}
