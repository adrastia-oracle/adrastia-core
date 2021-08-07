//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

abstract contract IAggregationStrategy {

    function aggregatePriceAndLiquidity(uint256[] memory prices, uint256[] memory tokenLiquidities, uint256[] memory baseLiquidities) virtual external view
        returns(uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity);

}
