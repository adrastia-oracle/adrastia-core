//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IOracle.sol";
import "../interfaces/IAggregatedOracle.sol";
import "../interfaces/IDataSource.sol";
import "../interfaces/IPriceStrategy.sol";
import "../interfaces/ILiquidityStrategy.sol";
import "../interfaces/IAggregationStrategy.sol";

import "../libraries/ObservationLibrary.sol";

import "hardhat/console.sol";

contract AggregatedOracle is IOracle, IAggregatedOracle {

    address public immutable aggregationStrategy;

    address[] public oracles;

    constructor(address aggregationStrategy_, address[] memory oracles_) {
        require(oracles_.length > 0, "AggregatedOracle: No oracles provided.");

        aggregationStrategy = aggregationStrategy_;
        oracles = oracles_;
    }

    function getOracles() override virtual external view returns(address[] memory) {
        return oracles;
    }

    function update(address token) override external {
        for (uint256 i = 0; i < oracles.length; ++i)
            IOracle(oracles[i]).update(token);
    }

    function consult(address token) override virtual external view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        require(oracles.length > 0, "No underlying oracles.");

        uint256[] memory prices = new uint256[](oracles.length);
        uint256[] memory tokenLiquidities = new uint256[](oracles.length);
        uint256[] memory baseLiquidities = new uint256[](oracles.length);

        for (uint256 i = 0; i < prices.length; ++i) {
            (prices[i], tokenLiquidities[i], baseLiquidities[i]) = IOracle(oracles[i]).consult(token);
        }

        return IAggregationStrategy(aggregationStrategy).aggregatePriceAndLiquidity(prices, tokenLiquidities, baseLiquidities);
    }

}
