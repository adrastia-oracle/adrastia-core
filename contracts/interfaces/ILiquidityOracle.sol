//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";

abstract contract ILiquidityOracle is IUpdateByToken {
    function quoteTokenName() public view virtual returns (string memory);

    function quoteTokenAddress() public view virtual returns (address);

    function quoteTokenSymbol() public view virtual returns (string memory);

    function quoteTokenDecimals() public view virtual returns (uint8);

    function consultLiquidity(address token)
        public
        view
        virtual
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity);

    function consultLiquidity(address token, uint256 maxAge)
        public
        view
        virtual
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity);
}
