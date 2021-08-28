//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

abstract contract ILiquidityOracle {

    function needsUpdate(address token) virtual public view returns(bool);

    function update(address token) virtual external;

    function consultLiquidity(address token) virtual external view
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity);

}
