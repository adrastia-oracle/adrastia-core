//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "../../accumulators/proto/uniswap/UniswapV2GeometricLiquidityAccumulator.sol";

contract UniswapV2GeometricLiquidityAccumulatorStub is UniswapV2GeometricLiquidityAccumulator {
    constructor(
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        UniswapV2GeometricLiquidityAccumulator(
            uniswapFactory_,
            initCodeHash_,
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
        return super.fetchLiquidity(token);
    }

    function validateObservation(bytes memory, uint112, uint112) internal virtual override returns (bool) {
        return true; // Disable for simplicity
    }
}
