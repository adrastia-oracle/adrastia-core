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

    function quoteTokenAddress() public view virtual override returns (address) {
        revert("TODO");
    }

    function quoteTokenSymbol() public view virtual override returns (string memory) {
        revert("TODO");
    }

    function needsUpdate(address token) public view virtual override returns (bool) {
        return IPriceOracle(priceOracle).needsUpdate(token) || ILiquidityOracle(liquidityOracle).needsUpdate(token);
    }

    function update(address token) external virtual override returns (bool) {
        bool priceUpdated = IPriceOracle(priceOracle).update(token);
        bool liquidityUpdated = ILiquidityOracle(liquidityOracle).update(token);

        return priceUpdated || liquidityUpdated;
    }

    function consult(address token)
        public
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

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        price = IPriceOracle(priceOracle).consultPrice(token, maxAge);
        (tokenLiquidity, quoteTokenLiquidity) = ILiquidityOracle(liquidityOracle).consultLiquidity(token, maxAge);
    }

    function consultPrice(address token) public view virtual override returns (uint256 price) {
        price = IPriceOracle(priceOracle).consultPrice(token);
    }

    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint256 price) {
        price = IPriceOracle(priceOracle).consultPrice(token, maxAge);
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        (tokenLiquidity, quoteTokenLiquidity) = ILiquidityOracle(liquidityOracle).consultLiquidity(token);
    }

    function consultLiquidity(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        (tokenLiquidity, quoteTokenLiquidity) = ILiquidityOracle(liquidityOracle).consultLiquidity(token, maxAge);
    }
}
