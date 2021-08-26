//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

library ObservationLibrary {

    struct Observation {
        uint256 timestamp;
        uint256 price;
        uint256 tokenLiquidity;
        uint256 baseLiquidity;
    }

    struct LiquidityObservation {
        uint256 tokenLiquidity;
        uint256 quoteTokenLiquidity;
        uint256 timestamp;
    }

    struct CumulativeLiquidityObservation {
        uint256 cumulativeTokenLiquidity;
        uint256 cumulativeQuoteTokenLiquidity;
        uint256 timestamp;
    }

}
