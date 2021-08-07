//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/IAggregationStrategy.sol";

contract WeightedLiquidityAggregationStrategy is IAggregationStrategy {

    using SafeMath for uint256;

    bool public immutable weightByToken;

    constructor(bool weightByToken_) {
        weightByToken = weightByToken_;
    }

    function aggregatePriceAndLiquidity(uint256[] memory prices, uint256[] memory tokenLiquidities, uint256[] memory baseLiquidities)
        override virtual external view returns(uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        require(prices.length == tokenLiquidities.length && prices.length == baseLiquidities.length, "Inconsistent amounts of input data.");
        require(prices.length > 0, "No data to aggregate.");

        price = 0;
        tokenLiquidity = 0;
        baseLiquidity = 0;

        for (uint256 i = 0; i < prices.length; ++i) {
            price = price.add(prices[i].mul(weightByToken ? tokenLiquidities[i] : baseLiquidities[i]));

            tokenLiquidity = tokenLiquidity.add(tokenLiquidities[i]);
            baseLiquidity = baseLiquidity.add(baseLiquidities[i]);
        }

        if (weightByToken)
            price = tokenLiquidity == 0 ? 0 : price.div(tokenLiquidity);
        else
            price = baseLiquidity == 0 ? 0 : price.div(baseLiquidity);
    }

}
