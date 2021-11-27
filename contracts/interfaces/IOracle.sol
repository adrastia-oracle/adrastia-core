//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";
import "./ILiquidityOracle.sol";
import "./IPriceOracle.sol";

abstract contract IOracle is IUpdateByToken, IPriceOracle, ILiquidityOracle {
    event Updated(
        address indexed token,
        address indexed quoteToken,
        uint256 indexed timestamp,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    );

    function quoteTokenName() external view virtual override(IPriceOracle, ILiquidityOracle) returns (string memory);

    function quoteTokenAddress() external view virtual override(IPriceOracle, ILiquidityOracle) returns (address);

    function quoteTokenSymbol() external view virtual override(IPriceOracle, ILiquidityOracle) returns (string memory);

    function quoteTokenDecimals() external view virtual override(IPriceOracle, ILiquidityOracle) returns (uint8);

    function consult(address token)
        public
        view
        virtual
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        );

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        );
}
