// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/algebra/AlgebraLiquidityAccumulator.sol";

contract AlgebraLiquidityAccumulatorStub is AlgebraLiquidityAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AlgebraLiquidityAccumulator(
            averagingStrategy_,
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
        return super.fetchLiquidity(abi.encode(token));
    }

    function validateObservation(bytes memory, uint112, uint112) internal virtual override returns (bool) {
        return true; // Disable for simplicity
    }
}
