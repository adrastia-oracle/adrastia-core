//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

contract OffchainPriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {}

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        if (token == address(0) || token == quoteToken) {
            // Invalid token
            return false;
        }

        return super.canUpdate(data);
    }

    /// @notice Validates that the observation time is not too old.
    /// @param updateData The data used to perform the update.
    /// @param price Disregarded.
    /// @return True if the observation time is not too old; false otherwise.
    function validateObservation(bytes memory updateData, uint112 price) internal virtual override returns (bool) {
        (address token, uint112 pPrice, uint32 pTimestamp) = abi.decode(updateData, (address, uint112, uint32));

        // Note: pPrice and price are both sourced from the updateData, so they should be equal. We don't need to
        // check them.
        bool validated = validateObservationTime(pTimestamp);

        emit ValidationPerformed(token, price, pPrice, block.timestamp, pTimestamp, validated);

        return validated;
    }

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112) {
        (, uint112 price) = abi.decode(data, (address, uint112));

        return price;
    }
}
