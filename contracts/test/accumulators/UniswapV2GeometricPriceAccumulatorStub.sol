//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "../../accumulators/proto/uniswap/UniswapV2GeometricPriceAccumulator.sol";

contract UniswapV2GeometricPriceAccumulatorStub is UniswapV2GeometricPriceAccumulator {
    constructor(
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        UniswapV2GeometricPriceAccumulator(
            uniswapFactory_,
            initCodeHash_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function stubFetchPrice(address token) public view returns (uint256 price) {
        return super.fetchPrice(token);
    }

    function stubComputeWholeUnitAmount(address token) public view returns (uint256 amount) {
        return super.computeWholeUnitAmount(token);
    }

    function validateObservation(bytes memory, uint112) internal virtual override returns (bool) {
        return true; // Disable for simplicity
    }
}
