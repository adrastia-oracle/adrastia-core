// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../ValueAndErrorAccumulator.sol";
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

contract CometUtilizationAndErrorAccumulator is ValueAndErrorAccumulator {
    using SafeCastExt for uint256;

    address public immutable comet;

    address public immutable baseToken;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;
    uint112 internal immutable _target;

    constructor(
        uint112 target_,
        IAveragingStrategy averagingStrategy_,
        address comet_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) ValueAndErrorAccumulator(averagingStrategy_, address(0), updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        comet = comet_;
        baseToken = IComet(comet_).baseToken();

        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;
        _target = target_;
    }

    function getTarget(address token) external view virtual returns (uint112) {
        return fetchTarget(abi.encode(token));
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function fetchValue(bytes memory data) internal view virtual override returns (uint112 value) {
        address token = abi.decode(data, (address));

        uint256 totalBorrow;
        uint256 totalSupply;

        if (token == baseToken) {
            // Base token can be both supplied and borrowed
            totalBorrow = IComet(comet).totalBorrow();
            totalSupply = IComet(comet).totalSupply();
        } else {
            // Other tokens can only be supplied as collateral
            IComet.TotalsCollateral memory totalsCollateral = IComet(comet).totalsCollateral(token);

            totalBorrow = 0;
            totalSupply = totalsCollateral.totalSupplyAsset;
        }

        if (totalSupply == 0) {
            value = 0; // Avoid division by zero
        } else {
            value = ((totalBorrow * _decimalFactor) / totalSupply).toUint112();
        }
    }

    function fetchTarget(bytes memory) internal view virtual override returns (uint112) {
        return _target;
    }
}
