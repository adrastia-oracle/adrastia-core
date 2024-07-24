// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";

contract AdrastiaPriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCast for uint256;

    address public immutable adrastiaOracle;

    bool public immutable validationDisabled;

    error InvalidAveragingStrategy(address strategy);

    constructor(
        bool validationDisabled_,
        IAveragingStrategy averagingStrategy_,
        address adrastiaOracle_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        PriceAccumulator(
            averagingStrategy_,
            IPriceOracle(adrastiaOracle_).quoteTokenAddress(),
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {
        if (address(averagingStrategy_) == address(0)) {
            revert InvalidAveragingStrategy(address(averagingStrategy_));
        }

        validationDisabled = validationDisabled_;
        adrastiaOracle = adrastiaOracle_;
    }

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        if (token == address(0) || token == quoteToken) {
            // Invalid token
            return false;
        }

        uint256 timeSinceLastUpdate = IPriceOracle(adrastiaOracle).timeSinceLastUpdate(data);
        uint256 heartbeat = _heartbeat();
        if (timeSinceLastUpdate > heartbeat) {
            return false;
        }

        return super.canUpdate(data);
    }

    /// @inheritdoc IQuoteToken
    function quoteTokenName()
        public
        view
        virtual
        override(IQuoteToken, SimpleQuotationMetadata)
        returns (string memory)
    {
        return IPriceOracle(adrastiaOracle).quoteTokenName();
    }

    /// @inheritdoc IQuoteToken
    function quoteTokenSymbol()
        public
        view
        virtual
        override(IQuoteToken, SimpleQuotationMetadata)
        returns (string memory)
    {
        return IPriceOracle(adrastiaOracle).quoteTokenSymbol();
    }

    /// @inheritdoc IQuoteToken
    function quoteTokenDecimals() public view virtual override(IQuoteToken, SimpleQuotationMetadata) returns (uint8) {
        return IPriceOracle(adrastiaOracle).quoteTokenDecimals();
    }

    /**
     * @notice Calculates the price of a token.
     * @dev When the price equals 0, a price of 1 is actually returned.
     * @param data The address of the token to calculate the price of, encoded as bytes.
     * @return price The price of the specified token in terms of the quote token, scaled by the quote token decimal
     *   places.
     */
    function fetchPrice(bytes memory data) internal view virtual override returns (uint112 price) {
        address token = abi.decode(data, (address));

        return IPriceOracle(adrastiaOracle).consultPrice(token, _heartbeat());
    }

    function validateObservation(bytes memory updateData, uint112 price) internal virtual override returns (bool) {
        if (validationDisabled) {
            return true;
        }

        return super.validateObservation(updateData, price);
    }
}
