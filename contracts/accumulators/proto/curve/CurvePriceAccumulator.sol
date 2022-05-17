//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../../libraries/SafeCastExt.sol";

import "./ICurvePool.sol";
import "../../PriceAccumulator.sol";

contract CurvePriceAccumulator is PriceAccumulator {
    using SafeCastExt for uint256;

    struct TokenConfig {
        uint8 decimals;
        int128 index;
    }

    address public immutable curvePool;

    int128 public immutable quoteTokenIndex;

    mapping(address => TokenConfig) public tokenIndices;

    constructor(
        address curvePool_,
        int8 nCoins_,
        address poolQuoteToken_,
        address ourQuoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(ourQuoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        curvePool = curvePool_;

        int128 quoteTokenIndex_ = -1;

        ICurvePool pool = ICurvePool(curvePool_);
        for (int128 i = 0; i < nCoins_; ++i) {
            address token = pool.coins(uint256(int256(i)));

            if (token == poolQuoteToken_)
                quoteTokenIndex_ = i; // Store quote token index
            else {
                TokenConfig storage config = tokenIndices[token];

                // Add one to reserve 0 for invalid
                config.index = i + 1; // Store token indices

                config.decimals = IERC20Metadata(token).decimals();
            }
        }

        require(quoteTokenIndex_ >= 0, "CurvePriceAccumulator: INVALID_QUOTE_TOKEN");

        quoteTokenIndex = quoteTokenIndex_;
    }

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        if (tokenIndices[token].index == 0) return false;

        return super.canUpdate(data);
    }

    /**
     * @notice Calculates the price of a token.
     * @dev When the price equals 0, a price of 1 is actually returned.
     * @param token The token to get the price for.
     * @return price The price of the specified token in terms of the quote token, scaled by the quote token decimal
     *   places.
     */
    function fetchPrice(address token) internal view virtual override returns (uint112 price) {
        ICurvePool pool = ICurvePool(curvePool);

        TokenConfig memory config = tokenIndices[token];
        require(config.index != 0, "CurvePriceAccumulator: INVALID_TOKEN");

        // Note: fees are included in the price
        price = pool
            .get_dy(
                config.index - 1, // Subtract the added one
                quoteTokenIndex,
                10**config.decimals // One whole token
            )
            .toUint112();

        if (price == 0) return 1;
    }
}
