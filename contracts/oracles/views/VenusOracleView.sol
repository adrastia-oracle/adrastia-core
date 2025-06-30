// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../AbstractOracle.sol";
import "../../utils/ExplicitQuotationMetadata.sol";

interface OracleInterface {
    function getPrice(address asset) external view returns (uint256);
}

/**
 * @title VenusOracleView
 * @author Tyler Loewen, TRILEZ SOFTWARE INC. dba. Adrastia
 * @notice A view oracle that retrieves prices from the Venus oracle contract and normalizes them to a specific number
 * of decimals.
 */
contract VenusOracleView is AbstractOracle, ExplicitQuotationMetadata {
    /**
     * @notice The address of the Venus oracle contract.
     */
    address internal immutable venusOracle;

    /**
     * @notice An error thrown when the timestamp is invalid.
     * @dev The timestamp is expected to be a valid Unix timestamp and should not exceed type(uint32).max.
     * @param timestamp The invalid timestamp.
     */
    error InvalidTimestamp(uint256 timestamp);

    /**
     * @notice An error thrown when the price exceeds the maximum allowed value.
     * @dev The price is expected to be less than or equal to type(uint112).max.
     */
    error AnswerTooLarge(uint256 answer);

    /**
     * @notice An error thrown when the provided quote token decimals are not 18.
     * @dev The provided quote token is expected to have 18 decimals.
     * @param decimals The number of decimals of the quote token.
     */
    error InvalidQuoteTokenDecimals(uint8 decimals);

    /**
     * @notice Constructs a new VenusOracleView instance.
     *
     * @param venusOracle_ The address of the Venus oracle contract. This contract is expected to provide a
     * `getPrice(address asset)` function.
     * @param quoteTokenName_ The name of the quote token. Informational only.
     * @param quoteTokenAddress_ The address of the quote token. Informational only.
     * @param quoteTokenSymbol_ The symbol of the quote token. Informational only.
     * @param quoteTokenDecimals_ The number of decimals used when returning price quotations.
     */
    constructor(
        address venusOracle_,
        string memory quoteTokenName_,
        address quoteTokenAddress_,
        string memory quoteTokenSymbol_,
        uint8 quoteTokenDecimals_
    )
        AbstractOracle(quoteTokenAddress_)
        ExplicitQuotationMetadata(quoteTokenName_, quoteTokenAddress_, quoteTokenSymbol_, quoteTokenDecimals_)
    {
        venusOracle = venusOracle_;
    }

    /// @inheritdoc IQuoteToken
    function quoteTokenName()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, SimpleQuotationMetadata, IQuoteToken)
        returns (string memory)
    {
        return _quoteTokenName;
    }

    /// @inheritdoc IQuoteToken
    function quoteTokenAddress()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, SimpleQuotationMetadata, IQuoteToken)
        returns (address)
    {
        return _quoteTokenAddress;
    }

    /// @inheritdoc IQuoteToken
    function quoteTokenSymbol()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, SimpleQuotationMetadata, IQuoteToken)
        returns (string memory)
    {
        return _quoteTokenSymbol;
    }

    /// @inheritdoc IQuoteToken
    function quoteTokenDecimals()
        public
        view
        virtual
        override(ExplicitQuotationMetadata, SimpleQuotationMetadata, IQuoteToken)
        returns (uint8)
    {
        return _quoteTokenDecimals;
    }

    /// @inheritdoc IOracle
    function liquidityDecimals() public view virtual override returns (uint8) {
        return 0; // Liquidity is not supported
    }

    /**
     * @notice Updates the oracle data.
     * @dev This oracle doesn't support updates.
     * @return False as this oracle doesn't support updates.
     */
    function update(bytes memory) public virtual override returns (bool) {
        return false;
    }

    /**
     * @notice Checks if the oracle needs an update.
     * @dev This oracle doesn't support updates.
     * @return False as this oracle doesn't need updates.
     */
    function needsUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    /**
     * @notice Checks if the oracle can be updated.
     * @dev This oracle doesn't support updates.
     * @return False as this oracle can't be updated.
     */
    function canUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    /**
     * @notice Retrieves the latest observation data by consulting the underlying accumulators.
     * @dev The observation timestamp is the oldest of the two accumulator observation timestamps.
     * @param token The address of the token.
     * @return observation The latest observation data.
     */
    function getLatestObservation(
        address token
    ) public view virtual override returns (ObservationLibrary.Observation memory observation) {
        (observation.price, observation.timestamp) = readUnderlyingFeed(token);
        observation.tokenLiquidity = 0;
        observation.quoteTokenLiquidity = 0;
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AbstractOracle, ExplicitQuotationMetadata) returns (bool) {
        return AbstractOracle.supportsInterface(interfaceId);
    }

    function getUnderlyingFeed() public view virtual returns (address) {
        return venusOracle;
    }

    /// @inheritdoc AbstractOracle
    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        (price, ) = readUnderlyingFeed(token);
        tokenLiquidity = 0;
        quoteTokenLiquidity = 0;
    }

    /**
     * @notice Gets the number of decimals for a token.
     * @dev Defaults to 18 decimals if the token does not implement the `decimals()` function or if the call fails.
     *
     * @param token The address of the token to get the decimals for. Use 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB
     * for native BNB.
     */
    function getTokenDecimals(address token) internal view virtual returns (uint8) {
        if (token == 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB) {
            return 18; // Native token (BNB - 18 decimals)
        }

        (bool success, bytes memory data) = address(token).staticcall(abi.encodeWithSignature("decimals()"));
        if (!success || data.length != 32) {
            return 18; // Assume 18
        }

        return abi.decode(data, (uint8));
    }

    function readUnderlyingFeed(address token) internal view virtual returns (uint112 price, uint32 timestamp) {
        uint256 workingPrice = OracleInterface(venusOracle).getPrice(token);
        uint256 ourDecimals = quoteTokenDecimals();
        uint256 venusFeedDecimals = 36 - getTokenDecimals(token);

        // Convert the price to the quote token's decimals
        if (venusFeedDecimals > ourDecimals) {
            workingPrice = workingPrice / (10 ** (venusFeedDecimals - ourDecimals));
        } else if (venusFeedDecimals < ourDecimals) {
            workingPrice = workingPrice * (10 ** (ourDecimals - venusFeedDecimals));
        }

        if (workingPrice > type(uint112).max) {
            revert AnswerTooLarge(workingPrice);
        }

        // Venus's oracles do not expose a timestamp, so we use the current block timestamp. We expect Venus oracles
        // to revert if the price is not fresh enough.
        uint256 blockTimestamp = block.timestamp;
        if (blockTimestamp > type(uint32).max) {
            revert InvalidTimestamp(blockTimestamp);
        }

        price = uint112(workingPrice);
        timestamp = uint32(blockTimestamp);
    }
}
