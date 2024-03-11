// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../AbstractOracle.sol";
import "../../utils/ExplicitQuotationMetadata.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    // getRoundData and latestRoundData should both raise "No data present"
    // if they do not have data to report, instead of returning unset values
    // which could be misinterpreted as actual reported values.
    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

contract ChainlinkOracleView is AbstractOracle {
    address internal immutable feedToken;
    address internal immutable chainlinkFeed;

    error AnswerCannotBeNegative(int256 answer);
    error AnswerTooLarge(int256 answer);
    error InvalidTimestamp(uint256 timestamp);
    error UnsupportedToken(address token);

    /**
     * @notice Constructs a new ChainlinkOracleView contract.
     * @dev Note that the quote token decimals of this contract is calculated using the decimals of the Chainlink feed.
     * @param chainlinkFeed_  The address of the Chainlink feed.
     * @param feedToken_  The address of the token that the feed describes.
     * @param quoteToken_  (Optional) The address of the quote token.
     */
    constructor(address chainlinkFeed_, address feedToken_, address quoteToken_) AbstractOracle(quoteToken_) {
        chainlinkFeed = chainlinkFeed_;
        feedToken = feedToken_;
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
        address feed = getUnderlyingFeed();

        return AggregatorV3Interface(feed).decimals();
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override(AbstractOracle) returns (bool) {
        return AbstractOracle.supportsInterface(interfaceId);
    }

    function getUnderlyingFeed() public view virtual returns (address) {
        return chainlinkFeed;
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

        (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(getUnderlyingFeed()).latestRoundData();

        if (answer < 0) {
            revert AnswerCannotBeNegative(answer);
        } else if (uint256(answer) > type(uint112).max) {
            revert AnswerTooLarge(answer);
        }

        if (updatedAt == 0 || updatedAt > type(uint32).max) {
            revert InvalidTimestamp(updatedAt);
        }

        price = uint112(uint256(answer));
        timestamp = uint32(updatedAt);
    }
}
