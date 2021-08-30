//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IOracle.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/ILiquidityOracle.sol";

contract CompositeOracle is IOracle {

    address immutable priceOracle;
    address immutable liquidityOracle;

    constructor(address priceOracle_, address liquidityOracle_) {
        // TODO: Ensure quote tokens match
        priceOracle = priceOracle_;
        liquidityOracle = liquidityOracle_;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        return IPriceOracle(priceOracle).needsUpdate(token) || ILiquidityOracle(liquidityOracle).needsUpdate(token);
    }

    function update(address token) override virtual external {
        IPriceOracle(priceOracle).update(token);
        ILiquidityOracle(liquidityOracle).update(token);
    }

    function consult(address token) override virtual external view
        returns (uint256 price, uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        price = IPriceOracle(priceOracle).consultPrice(token);
        (tokenLiquidity, quoteTokenLiquidity) = ILiquidityOracle(liquidityOracle).consultLiquidity(token);
    }

}