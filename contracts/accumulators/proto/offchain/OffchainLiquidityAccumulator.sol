// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../LiquidityAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

contract OffchainLiquidityAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    uint8 internal immutable _liquidityDecimals;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        _liquidityDecimals = decimals_;
    }

    /// @inheritdoc LiquidityAccumulator
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
    /// @param tokenLiquidity Disregarded.
    /// @param quoteTokenLiquidity Disregarded.
    /// @return True if the observation time is not too old; false otherwise.
    function validateObservation(
        bytes memory updateData,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) internal virtual override returns (bool) {
        (address token, uint112 pTokenLiquidity, uint112 pQuoteTokenLiquidity, uint32 pTimestamp) = abi.decode(
            updateData,
            (address, uint112, uint112, uint32)
        );

        // Note: All data is sourced from the updateData, so we don't need to validate tokenLiquidity and
        // quoteTokenLiquidity.
        bool validated = validateObservationTime(pTimestamp);

        emit ValidationPerformed(
            token,
            tokenLiquidity,
            pTokenLiquidity,
            quoteTokenLiquidity,
            pQuoteTokenLiquidity,
            block.timestamp,
            pTimestamp,
            validated
        );

        return validated;
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function fetchLiquidity(bytes memory data) internal view virtual override returns (uint112, uint112) {
        (, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) = abi.decode(data, (address, uint112, uint112));

        return (tokenLiquidity, quoteTokenLiquidity);
    }
}
