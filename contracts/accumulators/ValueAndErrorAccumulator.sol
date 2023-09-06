//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./LiquidityAccumulator.sol";

import "hardhat/console.sol";

abstract contract ValueAndErrorAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCast for uint256;
    using SafeCastExt for uint256;

    uint112 public constant ERROR_ZERO = 1e18;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function fetchValue(bytes memory data) internal view virtual returns (uint112 value);

    function fetchTarget(bytes memory data) internal view virtual returns (uint112 target);

    function fetchLiquidity(bytes memory data) internal view virtual override returns (uint112 value, uint112 err) {
        value = fetchValue(data);
        uint256 target = fetchTarget(data);

        if (target >= value) {
            err = (ERROR_ZERO + (target - value)).toUint112();
        } else {
            err = (ERROR_ZERO - (value - target)).toUint112();
        }
    }
}
