//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@openzeppelin-v4/contracts/access/Ownable.sol";

import "./UniswapV2Oracle.sol";

contract ManagedUniswapV2Oracle is Ownable, UniswapV2Oracle {
    constructor(
        address liquidityAccumulator_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 period_
    ) UniswapV2Oracle(liquidityAccumulator_, uniswapFactory_, initCodeHash_, quoteToken_, period_) {}

    function _update(address token) internal virtual override onlyOwner returns (bool) {
        return super._update(token);
    }
}
