//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

abstract contract IOracle {

    function needsUpdate(address token) virtual public view returns(bool);

    function update(address token) virtual external;

    function consult(address token) virtual external view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity);

}
