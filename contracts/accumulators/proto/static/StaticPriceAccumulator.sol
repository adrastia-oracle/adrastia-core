//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

contract StaticPriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    uint112 internal immutable staticPrice;

    constructor(
        address quoteToken_,
        uint112 price_
    ) PriceAccumulator(IAveragingStrategy(address(0)), quoteToken_, 1, 1, 2) {
        staticPrice = price_;
    }

    function calculatePrice(
        AccumulationLibrary.PriceAccumulator calldata,
        AccumulationLibrary.PriceAccumulator calldata
    ) external view virtual override returns (uint112) {
        return staticPrice;
    }

    function needsUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    function canUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    function update(bytes memory) public virtual override returns (bool) {
        return false;
    }

    function lastUpdateTime(bytes memory) public view virtual override returns (uint256) {
        return block.timestamp;
    }

    function timeSinceLastUpdate(bytes memory) public view virtual override returns (uint256) {
        return 0;
    }

    /// @inheritdoc IPriceAccumulator
    function getLastAccumulation(
        address
    ) public view virtual override returns (AccumulationLibrary.PriceAccumulator memory) {
        return AccumulationLibrary.PriceAccumulator({cumulativePrice: 0, timestamp: uint32(block.timestamp)});
    }

    /// @inheritdoc IPriceAccumulator
    function getCurrentAccumulation(
        address
    ) public view virtual override returns (AccumulationLibrary.PriceAccumulator memory) {
        return AccumulationLibrary.PriceAccumulator({cumulativePrice: 0, timestamp: uint32(block.timestamp)});
    }

    /// @inheritdoc IPriceOracle
    function consultPrice(address) public view virtual override returns (uint112) {
        return staticPrice;
    }

    function consultPrice(address, uint256) public view virtual override returns (uint112) {
        return staticPrice;
    }

    function fetchPrice(bytes memory) internal view virtual override returns (uint112) {
        return staticPrice;
    }
}
