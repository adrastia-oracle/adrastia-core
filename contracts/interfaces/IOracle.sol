//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IUpdateByToken.sol";
import "./ILiquidityOracle.sol";
import "./IPriceOracle.sol";

abstract contract IOracle is IUpdateByToken, IPriceOracle, ILiquidityOracle {
    function consult(address token)
        public
        view
        virtual
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 baseLiquidity
        );

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 baseLiquidity
        );
}
