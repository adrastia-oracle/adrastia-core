//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

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

    function needsUpdate(address token) public view virtual override returns (bool) {
        return IPriceOracle(priceOracle).needsUpdate(token) || ILiquidityOracle(liquidityOracle).needsUpdate(token);
    }

    function update(address token) external virtual override {
        IPriceOracle(priceOracle).update(token);
        ILiquidityOracle(liquidityOracle).update(token);
    }

    function consult(address token)
        external
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        price = IPriceOracle(priceOracle).consultPrice(token);
        (tokenLiquidity, quoteTokenLiquidity) = ILiquidityOracle(liquidityOracle).consultLiquidity(token);
    }
}
