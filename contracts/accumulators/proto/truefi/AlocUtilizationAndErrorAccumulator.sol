// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../ValueAndErrorAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

interface IAloc {
    function utilization() external view returns (uint256);

    function liquidAssets() external view returns (uint256);

    function BASIS_PRECISION() external view returns (uint256);
}

contract AlocUtilizationAndErrorAccumulator is ValueAndErrorAccumulator {
    using SafeCastExt for uint256;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;
    uint112 internal immutable _target;
    bool internal immutable _considerEmptyAs100Percent;

    constructor(
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
        address alocAddress = abi.decode(data, (address));

        uint256 utilization = IAloc(alocAddress).utilization();
        if (_considerEmptyAs100Percent) {
            if (utilization == 0 && IAloc(alocAddress).liquidAssets() == 0) {
                // Utilization is 0, but the ALOC has no liquidity. Let's instead consider the utilization to be 100%.
                // When used in a PID interest rate controller, this will cause the interest rate to rise so as to attract
                // more liquidity.
                // In other cases, it just makes more sense to consider the utilization to be 100% when there is no
                // liquidity. i.e. if there is no liquidity, then all available liquidity is being used.
                return _decimalFactor.toUint112();
            }
        }

        // Convert from the ALOC's units to the units used by the accumulator
        utilization *= _decimalFactor;
        utilization /= IAloc(alocAddress).BASIS_PRECISION();

        return utilization.toUint112();
    }

    function fetchTarget(bytes memory) internal view virtual override returns (uint112) {
        return _target;
    }
}
