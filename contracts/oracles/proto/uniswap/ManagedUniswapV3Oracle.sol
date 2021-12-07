//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin-v3/contracts/access/Ownable.sol";

import "./UniswapV3Oracle.sol";

contract ManagedUniswapV3Oracle is Ownable, UniswapV3Oracle {
    constructor(
        address liquidityAccumulator_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint256 period_
    ) UniswapV3Oracle(liquidityAccumulator_, uniswapFactory_, initCodeHash_, poolFees_, quoteToken_, period_) {}

    function _update(address token) internal virtual override onlyOwner returns (bool) {
        return super._update(token);
    }
}
