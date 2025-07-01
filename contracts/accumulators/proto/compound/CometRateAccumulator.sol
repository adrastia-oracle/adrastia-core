// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "../../PriceAccumulator.sol";

abstract contract IComet {
    function getSupplyRate(uint utilization) public view virtual returns (uint64);

    function getBorrowRate(uint utilization) public view virtual returns (uint64);

    function getUtilization() public view virtual returns (uint);

    function baseToken() external view virtual returns (address);
}

contract CometRateAccumulator is PriceAccumulator {
    using SafeCast for uint256;

    address public immutable comet;

    error InvalidRateType(uint256 rateType);

    constructor(
        IAveragingStrategy averagingStrategy_,
        address comet_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        PriceAccumulator(
            averagingStrategy_,
            IComet(comet_).baseToken(),
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {
        comet = comet_;
    }

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112) {
        return fetchPrice(data, 0 /* not used - save on gas */);
    }

    function fetchPrice(bytes memory data, uint256 /* maxAge */) internal view virtual override returns (uint112 rate) {
        uint256 rateType = abi.decode(data, (uint256));

        uint256 utilization = IComet(comet).getUtilization();

        if (rateType == 16) {
            rate = uint112(IComet(comet).getSupplyRate(utilization));
        } else if (rateType == 17) {
            rate = uint112(IComet(comet).getBorrowRate(utilization));
        } else {
            revert InvalidRateType(rateType);
        }

        // Convert from second rate to yearly rate
        rate *= 365 days;
    }
}
