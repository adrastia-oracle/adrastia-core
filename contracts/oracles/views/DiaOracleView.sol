// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../AbstractOracle.sol";
import "../../libraries/StringLibrary.sol";

interface IDIAOracleV2 {
    function getValue(string memory) external view returns (uint128 value, uint128 timestamp);
}

contract DiaOracleView is AbstractOracle {
    using StringLibrary for bytes32;

    address internal immutable feedToken;
    address internal immutable diaAddress;
    bytes32 internal immutable feedId;
    uint8 internal immutable feedTokenDecimals;

    error AnswerTooLarge(int256 answer);
    error InvalidTimestamp(uint256 timestamp);
    error UnsupportedToken(address token);

    /**
     * @notice Constructs a new DiaOracleView contract.
     * @param diaAddress_  The address of the DIA contract.
     * @param feedId_  The ID of the DIA feed.
     * @param feedToken_  The address of the token that the feed describes.
     * @param feedTokenDecimals_  The number of decimals of the feed token.
     * @param quoteToken_  (Optional) The address of the quote token.
     */
    constructor(
        address diaAddress_,
        bytes32 feedId_,
        address feedToken_,
        uint8 feedTokenDecimals_,
        address quoteToken_
    ) AbstractOracle(quoteToken_) {
        diaAddress = diaAddress_;
        feedId = feedId_;
        feedToken = feedToken_;
        feedTokenDecimals = feedTokenDecimals_;
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

    /// @inheritdoc IQuoteToken
    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return feedTokenDecimals;
    }

    function getUnderlyingFeed() public view virtual returns (address) {
        return diaAddress;
    }

    function getUnderlyingFeedId() public view virtual returns (bytes32) {
        return feedId;
    }

    function getFeedToken() public view virtual returns (address) {
        return feedToken;
    }

    /// @inheritdoc AbstractOracle
    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        (price, ) = readUnderlyingFeed(token);
        tokenLiquidity = 0;
        quoteTokenLiquidity = 0;
    }

    function readUnderlyingFeed(address token) internal view virtual returns (uint112 price, uint32 timestamp) {
        if (token != getFeedToken()) {
            revert UnsupportedToken(token);
        }

        (uint128 workingPrice, uint128 workingTimestamp) = IDIAOracleV2(getUnderlyingFeed()).getValue(
            getUnderlyingFeedId().bytes32ToString()
        );

        if (workingPrice > type(uint112).max) {
            revert AnswerTooLarge(int256(uint256(workingPrice)));
        }

        if (workingTimestamp == 0 || workingTimestamp > type(uint32).max) {
            revert InvalidTimestamp(workingTimestamp);
        }

        price = uint112(workingPrice);
        timestamp = uint32(workingTimestamp);
    }
}
