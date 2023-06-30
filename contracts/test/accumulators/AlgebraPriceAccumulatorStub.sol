//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/algebra/AlgebraPriceAccumulator.sol";

contract AlgebraPriceAccumulatorStub is AlgebraPriceAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        AlgebraPriceAccumulator(
            averagingStrategy_,
            uniswapFactory_,
            initCodeHash_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubFetchPrice(address token) public view returns (uint256 price) {
        return super.fetchPrice(abi.encode(token));
    }

    function stubComputeWholeUnitAmount(address token) public view returns (uint128 amount) {
        return super.computeWholeUnitAmount(token);
    }

    function stubCalculatePriceFromSqrtPrice(
        address token,
        address quoteToken_,
        uint160 sqrtPriceX96,
        uint128 tokenAmount
    ) public pure returns (uint256 price) {
        return calculatePriceFromSqrtPrice(token, quoteToken_, sqrtPriceX96, tokenAmount);
    }

    function stubComputeAddress(address token, address quoteToken_) public view returns (address pool) {
        return super.computeAddress(token, quoteToken_);
    }

    function validateObservation(bytes memory, uint112) internal virtual override returns (bool) {
        return true; // Disable for simplicity
    }
}
