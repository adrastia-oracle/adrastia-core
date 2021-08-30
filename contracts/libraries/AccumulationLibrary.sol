//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.9;

pragma experimental ABIEncoderV2;

library AccumulationLibrary {

    struct LiquidityAccumulator {
        uint256 cumulativeTokenLiquidity;
        uint256 cumulativeQuoteTokenLiquidity;
        uint256 timestamp;
    }

    struct PriceAccumulator {
        uint256 cumulativeTokenPrice;
        uint256 cumulativeQuoteTokenPrice;
        uint256 timestamp;
    }

}
