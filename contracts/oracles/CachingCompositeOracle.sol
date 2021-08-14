//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

import "../interfaces/IOracle.sol";

contract CachingCompositeOracle is IOracle {

    struct MarketData {
        uint256 lastPrice;
        uint256 lastTokenLiquidity;
        uint256 lastBaseLiquidity;
    }

    address immutable public oracle;

    mapping(address => MarketData) cachedMarketData;

    constructor(address oracle_) {
        oracle = oracle_;
    }

    function update(address token) override virtual external {
        IOracle(oracle).update(token);

        MarketData storage marketData = cachedMarketData[token];

        (marketData.lastPrice, marketData.lastTokenLiquidity, marketData.lastBaseLiquidity) = IOracle(oracle).consult(token);
    }

    function consult(address token) override virtual public view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        MarketData storage marketData = cachedMarketData[token];

        return (marketData.lastPrice, marketData.lastTokenLiquidity, marketData.lastBaseLiquidity);
    }

}
