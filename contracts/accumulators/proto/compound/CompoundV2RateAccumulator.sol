// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "../../PriceAccumulator.sol";

abstract contract ICToken {
    function supplyRatePerBlock() external view virtual returns (uint256);

    function borrowRatePerBlock() external view virtual returns (uint256);
}

contract CompoundV2RateAccumulator is PriceAccumulator {
    using SafeCast for uint256;

    address public immutable cToken;

    uint256 public immutable blocksPerYear;

    error InvalidRateType(uint256 rateType);

    error InvalidBlocksPerYear(uint256 blocksPerYear);

    constructor(
        IAveragingStrategy averagingStrategy_,
        uint256 blocksPerYear_,
        address cToken_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        if (blocksPerYear_ == 0 || blocksPerYear_ > type(uint112).max) revert InvalidBlocksPerYear(blocksPerYear_);
        blocksPerYear = blocksPerYear_;
        cToken = cToken_;
    }

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112) {
        return fetchPrice(data, 0 /* not used - save on gas */);
    }

    function fetchPrice(bytes memory data, uint256 /* maxAge */) internal view virtual override returns (uint112 rate) {
        uint256 rateType = abi.decode(data, (uint256));

        if (rateType == 16) {
            rate = uint112(ICToken(cToken).supplyRatePerBlock());
        } else if (rateType == 17) {
            rate = uint112(ICToken(cToken).borrowRatePerBlock());
        } else {
            revert InvalidRateType(rateType);
        }

        // Convert from block rate to yearly rate
        rate *= uint112(blocksPerYear);
    }
}
