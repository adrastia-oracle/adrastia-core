// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {IERC20Metadata} from "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC4626} from "@openzeppelin-v4/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import {PriceAccumulator} from "../../PriceAccumulator.sol";
import {IPriceOracle} from "../../../interfaces/IPriceOracle.sol";
import {IAveragingStrategy} from "../../../strategies/averaging/IAveragingStrategy.sol";
import {IQuoteToken} from "../../../interfaces/IQuoteToken.sol";
import {SimpleQuotationMetadata} from "../../../utils/SimpleQuotationMetadata.sol";

/**
 * @title Single Asset Vault (SAV) Price Accumulator
 * @author TRILEZ SOFTWARE INC.
 */
contract SAVPriceAccumulator is PriceAccumulator {
    using SafeCast for uint256;

    IPriceOracle internal immutable _underlyingAssetOracle;

    error InvalidAveragingStrategy(address strategy);

    error InvalidOracle(address oracle);

    error OracleHeartbeatIncompatible(address oracle, uint256 oracleHeartbeat, uint256 ourHeartbeat);

    error InvalidQuoteToken(address quoteToken);

    constructor(
        IPriceOracle underlyingOracle_,
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        if (address(underlyingOracle_) == address(0)) {
            revert InvalidOracle(address(underlyingOracle_));
        }

        if (address(averagingStrategy_) == address(0)) {
            revert InvalidAveragingStrategy(address(averagingStrategy_));
        }

        if (quoteToken_ == address(0)) {
            revert InvalidQuoteToken(quoteToken_);
        }

        verifyUnderlyingOracleHeartbeat(address(underlyingOracle_), maxUpdateDelay_);

        _underlyingAssetOracle = underlyingOracle_;
    }

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        IERC4626 vault = IERC4626(abi.decode(data, (address)));

        if (address(vault) == address(0) || address(vault) == quoteToken) {
            // Invalid token
            return false;
        }

        // Attempt to get the vault asset using a static call
        (bool success, bytes memory assetData) = address(vault).staticcall(
            abi.encodeWithSelector(vault.asset.selector)
        );
        if (!success || assetData.length != 32) {
            return false;
        }

        uint256 timeSinceLastUpdate = IPriceOracle(underlyingAssetOracle()).timeSinceLastUpdate(assetData);
        uint256 heartbeat = _heartbeat();
        if (timeSinceLastUpdate > heartbeat) {
            return false;
        }

        return super.canUpdate(data);
    }

    function underlyingAssetOracle() public view virtual returns (IPriceOracle) {
        return _underlyingAssetOracle;
    }

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112) {
        return fetchPrice(data, 0 /* not used - save on gas */);
    }

    function fetchPrice(bytes memory data, uint256 /* maxAge */) internal view virtual override returns (uint112) {
        IERC4626 vault = IERC4626(abi.decode(data, (address)));
        uint256 vaultSupply = vault.totalSupply();

        address asset = vault.asset();

        uint256 totalAssets = vault.totalAssets();

        IPriceOracle oracle = underlyingAssetOracle();
        uint256 assetPrice = oracle.consultPrice(asset, _heartbeat());
        uint256 priceDecimals = oracle.quoteTokenDecimals();
        uint256 assetDecimals = IERC20Metadata(asset).decimals();

        uint256 vaultDecimals = vault.decimals();

        uint256 ourDecimals = quoteTokenDecimals();

        uint256 sharePrice = assetPrice * totalAssets; // In terms of price decimals + asset decimals

        // Convert to our decimals and add vault decimals (we add vault decimals because we are dividing by total supply)
        int256 decimalShift = int256(vaultDecimals) +
            int256(ourDecimals) -
            (int256(priceDecimals) + int256(assetDecimals));
        if (decimalShift > 0) {
            sharePrice *= 10 ** uint256(decimalShift);
        } else if (decimalShift < 0) {
            // Note: If decimalShift equals type(int256).min, this negation will overflow. But this operation is safe
            // as all decimals are 8 bit numbers, making it impossible for decimalShift to equal type(int256).min.
            sharePrice /= 10 ** uint256(-decimalShift);
        }

        // If the vault has no supply, the share price is 0
        if (vaultSupply == 0) {
            return 0;
        }

        unchecked {
            sharePrice /= vaultSupply;
        }

        return sharePrice.toUint112();
    }

    function verifyUnderlyingOracleHeartbeat(address oracle, uint256 ourHeartbeat) internal view virtual {
        (bool success, bytes memory data) = oracle.staticcall(abi.encodeWithSignature("heartbeat()"));
        if (success && data.length == 32) {
            uint256 oracleHeartbeat = abi.decode(data, (uint256));
            // We want our heartbeat to be gte the oracle's heartbeat. Otherwise, there may be times where we require
            // an update, but the underlying oracle hasn't been updated within our heartbeat (causing a revert).
            if (ourHeartbeat < oracleHeartbeat) {
                revert OracleHeartbeatIncompatible(oracle, oracleHeartbeat, ourHeartbeat);
            }
        }
        // else we don't know the heartbeat, so we can't verify it. Do nothing.
    }
}
