// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../../accumulators/LiquidityAccumulator.sol";

contract LiquidityAccumulatorHarness is LiquidityAccumulator {
    struct MockLiquidity {
        uint256 tokenLiquidity;
        uint256 quoteTokenLiquidity;
    }

    mapping(address => MockLiquidity) public mockLiquidity;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    function setLiquidity(
        address token,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) public {
        MockLiquidity storage liquidity = mockLiquidity[token];

        liquidity.tokenLiquidity = tokenLiquidity;
        liquidity.quoteTokenLiquidity = quoteTokenLiquidity;
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        MockLiquidity storage liquidity = mockLiquidity[token];

        return (liquidity.tokenLiquidity, liquidity.quoteTokenLiquidity);
    }
}
