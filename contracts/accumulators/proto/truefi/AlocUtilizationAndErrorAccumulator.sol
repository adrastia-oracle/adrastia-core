// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../ValueAndErrorAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

interface IAloc {
    struct InterestRateParameters {
        uint32 minInterestRate;
        uint32 minInterestRateUtilizationThreshold;
        uint32 optimumInterestRate;
        uint32 optimumUtilization;
        uint32 maxInterestRate;
        uint32 maxInterestRateUtilizationThreshold;
    }

    function utilization() external view returns (uint256);

    function interestRateParameters() external view returns (InterestRateParameters memory);

    function BASIS_PRECISION() external view returns (uint256);
}

contract AlocUtilizationAndErrorAccumulator is ValueAndErrorAccumulator {
    using SafeCastExt for uint256;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;

    constructor(
        IAveragingStrategy averagingStrategy_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) ValueAndErrorAccumulator(averagingStrategy_, address(0), updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;
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

        utilization *= _decimalFactor;
        utilization /= IAloc(alocAddress).BASIS_PRECISION();

        return utilization.toUint112();
    }

    function fetchTarget(bytes memory data) internal view virtual override returns (uint112) {
        address alocAddress = abi.decode(data, (address));

        uint256 target = IAloc(alocAddress).interestRateParameters().optimumUtilization;

        target *= _decimalFactor;
        target /= IAloc(alocAddress).BASIS_PRECISION();

        return target.toUint112();
    }
}
