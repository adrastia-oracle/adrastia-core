//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

pragma experimental ABIEncoderV2;

interface IUniswapV3Util {
    struct CalculateWeightedPriceParams {
        address token;
        address quoteToken;
        address uniswapFactory;
        bytes32 initCodeHash;
        uint32 period;
        uint128 tokenAmount;
        uint24[] poolFees;
    }

    function calculateWeightedPrice(CalculateWeightedPriceParams calldata params)
        external
        view
        returns (bool hasLiquidity, uint256 price);
}
