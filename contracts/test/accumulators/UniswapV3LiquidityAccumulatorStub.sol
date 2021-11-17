//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

pragma experimental ABIEncoderV2;

import "../../accumulators/proto/uniswap/UniswapV3LiquidityAccumulator.sol";

contract UniswapV3LiquidityAccumulatorStub is UniswapV3LiquidityAccumulator {
    constructor(
        address uniswapFactory_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        UniswapV3LiquidityAccumulator(
            uniswapFactory_,
            poolFees_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function harnessFetchLiquidity(address token)
        public
        view
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        return super.fetchLiquidity(token);
    }

    function stubIsContract(address addr) public view returns (bool) {
        return isContract(addr);
    }
}
