// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "../../accumulators/proto/uniswap/UniswapV3LiquidityAccumulator.sol";

contract UniswapV3LiquidityAccumulatorStub is UniswapV3LiquidityAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        UniswapV3LiquidityAccumulator(
            averagingStrategy_,
            uniswapFactory_,
            initCodeHash_,
            poolFees_,
            quoteToken_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function harnessFetchLiquidity(
        address token
    ) public view returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        return super.fetchLiquidity(abi.encode(token));
    }

    function validateObservation(bytes memory, uint112, uint112) internal virtual override returns (bool) {
        return true; // Disable for simplicity
    }
}
