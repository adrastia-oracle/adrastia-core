// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../ValueAndErrorAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

contract IonicUtilizationAndErrorAccumulator is ValueAndErrorAccumulator {
    using SafeCastExt for uint256;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;
    uint112 internal immutable _target;
    bool internal immutable _considerEmptyAs100Percent;
    address internal immutable _supplyAndBorrowOracle;

    constructor(
        address supplyAndBorrowOracle_,
        bool considerEmptyAs100Percent_,
        uint112 target_,
        IAveragingStrategy averagingStrategy_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) ValueAndErrorAccumulator(averagingStrategy_, address(0), updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;
        _target = target_;
        _considerEmptyAs100Percent = considerEmptyAs100Percent_;
        _supplyAndBorrowOracle = supplyAndBorrowOracle_;
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

    function fetchValue(bytes memory data) internal view virtual override returns (uint112) {
        address token = abi.decode(data, (address));

        (uint256 totalBorrow, uint256 totalSupply) = ILiquidityOracle(_supplyAndBorrowOracle).consultLiquidity(token);

        if (totalSupply == 0) {
            if (_considerEmptyAs100Percent) {
                // If there is no liquidity, then all available liquidity is being used.
                return _decimalFactor.toUint112();
            } else {
                // If there is no liquidity, then the utilization is 0%.
                return 0;
            }
        }

        uint256 utilization = (totalBorrow * _decimalFactor) / totalSupply;

        return utilization.toUint112();
    }

    function fetchTarget(bytes memory) internal view virtual override returns (uint112) {
        return _target;
    }

    function validateObservation(bytes memory, uint112, uint112) internal virtual override returns (bool) {
        // Since this contract reads from a secured oracle, we don't need to validate the observation. There's no
        // ability for an updater to manipulate the data.
        return true;
    }
}
