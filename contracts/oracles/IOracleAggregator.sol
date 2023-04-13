//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../strategies/aggregation/IAggregationStrategy.sol";

interface IOracleAggregator {
    struct Oracle {
        address oracle; // The oracle address, 160 bits
        uint8 priceDecimals; // The number of decimals of the price
        uint8 liquidityDecimals; // The number of decimals of the liquidity
    }

    function aggregationStrategy() external view returns (IAggregationStrategy strategy);

    function getOracles(address token) external view returns (Oracle[] memory oracles);
}
