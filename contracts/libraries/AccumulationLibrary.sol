//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

library AccumulationLibrary {

    struct LiquidityAccumulator {
        uint256 cumulativeTokenLiquidity;
        uint256 cumulativeQuoteTokenLiquidity;
        uint256 timestamp;
    }

}
