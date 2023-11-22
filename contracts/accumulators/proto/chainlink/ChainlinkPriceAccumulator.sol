//SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

/// @author Chainlink
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

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

contract ChainlinkPriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    /// @notice The Chainlink aggregator to use as the source of the price.
    AggregatorV3Interface public immutable source;

    /// @notice The token that the price is for.
    /// @dev Normally, accumulators can be used for any token, but Chainlink aggregators are token-specific.
    address public immutable token;

    error AnswerCannotBeNegative(int256 answer);
    error AnswerTooLarge(int256 answer);
    error AnswerTooOld(uint256 updatedAt);

    constructor(
        IAveragingStrategy averagingStrategy_,
        AggregatorV3Interface source_,
        address token_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        source = source_;
        token = token_;
    }

    /// @inheritdoc PriceAccumulator
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        address inputToken = abi.decode(data, (address));
        if (inputToken != token) {
            // The updater is trying to update the accumulator for a different token than the one that the aggregator
            // is for.
            return false;
        }

        (, , , uint256 updatedAt, ) = source.latestRoundData();
        uint256 timeSinceUpdate = block.timestamp - updatedAt;
        if (timeSinceUpdate > _heartbeat()) {
            // The price is too old.
            return false;
        }

        return super.needsUpdate(data);
    }

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        (, int256 answer, , , ) = source.latestRoundData();
        if (answer < 0 || uint256(answer) > type(uint112).max) {
            // The answer is invalid.
            return false;
        }

        return super.canUpdate(data);
    }

    function quoteTokenDecimals() public view virtual override(IQuoteToken, SimpleQuotationMetadata) returns (uint8) {
        return source.decimals();
    }

    function fetchPrice(bytes memory) internal view virtual override returns (uint112) {
        (, int256 answer, , uint256 updatedAt, ) = source.latestRoundData();
        uint256 timeSinceUpdate = block.timestamp - updatedAt;
        if (answer < 0) {
            revert AnswerCannotBeNegative(answer);
        } else if (uint256(answer) > type(uint112).max) {
            revert AnswerTooLarge(answer);
        } else if (timeSinceUpdate > _heartbeat()) {
            revert AnswerTooOld(updatedAt);
        } else if (answer == 0) {
            return 1; // All price accumulators report 1 if the price is 0
        }

        return uint112(uint256(answer));
    }
}
