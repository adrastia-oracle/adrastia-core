// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../AbstractOracle.sol";

interface IPyth {
    struct Price {
        // Price
        int64 price;
        // Confidence interval around the price
        uint64 conf;
        // Price exponent
        int32 expo;
        // Unix timestamp describing when the price was published
        uint publishTime;
    }

    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);
}

contract PythOracleView is AbstractOracle {
    address internal immutable feedToken;
    address internal immutable pythAddress;
    bytes32 internal immutable feedId;
    uint64 internal immutable minConfidence;
    uint8 internal immutable feedTokenDecimals;

    uint8 public constant CONFIDENCE_DECIMALS = 8;
    uint256 internal constant CONFIDENCE_MULTIPLIER = 10 ** CONFIDENCE_DECIMALS;

    error AnswerCannotBeNegative(int256 answer);
    error AnswerTooLarge(int256 answer);
    error InvalidTimestamp(uint256 timestamp);
    error UnsupportedToken(address token);
    error InvalidConstructorArgument();
    error ConfidenceTooLow(uint256 confidence);
    error InvalidExponent(int32 exponent);

    /**
     * @notice Constructs a new PythOracleView contract.
     * @param pythAddress_  The address of the Pyth contract.
     * @param feedId_  The ID of the Pyth feed.
     * @param feedToken_  The address of the token that the feed describes.
     * @param minConfidence_  The minimum confidence level required for the oracle to return a price.
     *   1e`CONFIDENCE_DECIMALS` represents 100% confidence and 0 represents 0% confidence. 0% confidence is not
     *   allowed.
     * @param quoteToken_  (Optional) The address of the quote token.
     */
    constructor(
        address pythAddress_,
        bytes32 feedId_,
        address feedToken_,
        uint64 minConfidence_,
        address quoteToken_
    ) AbstractOracle(quoteToken_) {
        if (pythAddress_ == address(0) || feedToken_ == address(0) || minConfidence_ == 0) {
            revert InvalidConstructorArgument();
        }

        pythAddress = pythAddress_;
        feedId = feedId_;
        feedToken = feedToken_;
        minConfidence = minConfidence_;
        feedTokenDecimals = super.quoteTokenDecimals();
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
        return pythAddress;
    }

    function getUnderlyingFeedId() public view virtual returns (bytes32) {
        return feedId;
    }

    function getFeedToken() public view virtual returns (address) {
        return feedToken;
    }

    /**
     * @notice Gets the minimum confidence level required for the oracle to return a price.
     * @return The minimum confidence level, with 1e`CONFIDENCE_DECIMALS` representing 100% confidence and 0
     * representing 0% confidence.
     */
    function getMinConfidence() public view virtual returns (uint64) {
        return minConfidence;
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

        IPyth.Price memory data = IPyth(getUnderlyingFeed()).getPriceUnsafe(getUnderlyingFeedId());

        if (data.price < 0) {
            revert AnswerCannotBeNegative(data.price);
        }

        uint256 ourDecimals = quoteTokenDecimals();
        uint256 workingPrice = uint256(int256(data.price)) * (10 ** ourDecimals);
        uint256 confidenceInterval = uint256(data.conf) * (10 ** ourDecimals);
        if (data.expo > 12 || data.expo < -12) {
            // The range of exponents supported by the Pyth Network client code is [-12, 12]
            revert InvalidExponent(data.expo);
        } else if (data.expo < 0) {
            uint256 divisor = 10 ** uint32(-data.expo);
            workingPrice /= divisor;
            confidenceInterval /= divisor;
        } else if (data.expo > 0) {
            uint256 multiplier = 10 ** uint32(data.expo);
            workingPrice *= multiplier;
            confidenceInterval *= multiplier;
        }

        if (workingPrice > type(uint112).max) {
            revert AnswerTooLarge(data.price);
        }

        if (data.publishTime == 0 || data.publishTime > type(uint32).max) {
            revert InvalidTimestamp(data.publishTime);
        }

        if (workingPrice > 0) {
            // Inverse confidence: 0 is 100% confidence; CONFIDENCE_MULTIPLIER or above is 0% confidence
            uint256 confidence = ((confidenceInterval * CONFIDENCE_MULTIPLIER) / workingPrice);
            if (confidence > CONFIDENCE_MULTIPLIER) {
                revert ConfidenceTooLow(0);
            }
            // Confidence: 0 is 0% confidence; CONFIDENCE_MULTIPLIER is 100% confidence
            confidence = CONFIDENCE_MULTIPLIER - confidence;
            if (confidence < getMinConfidence()) {
                revert ConfidenceTooLow(confidence);
            }
        } else {
            if (data.conf > 0) {
                // If the confidence interval is non-zero, we can't trust the price
                // The price can only be zero if we're 100% confident that it's zero
                revert ConfidenceTooLow(0);
            }
        }

        price = uint112(workingPrice);
        timestamp = uint32(data.publishTime);
    }
}
