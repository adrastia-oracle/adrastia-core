// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../LiquidityAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

interface IComet {
    struct TotalsCollateral {
        uint128 totalSupplyAsset;
        uint128 _reserved;
    }

    function totalsCollateral(address) external view returns (TotalsCollateral memory);

    function totalSupply() external view returns (uint256);

    function totalBorrow() external view returns (uint256);

    function baseToken() external view returns (address);
}

contract CometSBAccumulator is LiquidityAccumulator {
    using SafeCastExt for uint256;

    address public immutable comet;

    address public immutable baseToken;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;
    uint256 internal immutable _baseTokenWholeUnit;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address comet_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, address(0), updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        comet = comet_;
        baseToken = IComet(comet_).baseToken();

        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;
        _baseTokenWholeUnit = 10 ** IERC20Metadata(baseToken).decimals();
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));
        if (token == baseToken) {
            // Base token can be both supplied and borrowed
            tokenLiquidity = ((IComet(comet).totalBorrow() * _decimalFactor) / _baseTokenWholeUnit).toUint112();
            quoteTokenLiquidity = ((IComet(comet).totalSupply() * _decimalFactor) / _baseTokenWholeUnit).toUint112();

            return (tokenLiquidity, quoteTokenLiquidity);
        } else {
            // Other tokens can only be supplied as collateral
            uint256 tokenDecimalsFactor = 10 ** IERC20Metadata(token).decimals();

            IComet.TotalsCollateral memory totalsCollateral = IComet(comet).totalsCollateral(token);

            uint256 totalSupply = (totalsCollateral.totalSupplyAsset * _decimalFactor) / tokenDecimalsFactor;
            if (totalSupply > type(uint112).max) {
                revert("CometSBAccumulator: totalSupply overflow");
            }

            tokenLiquidity = uint112(totalSupply);

            return (0, tokenLiquidity);
        }
    }
}
