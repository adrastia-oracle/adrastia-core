//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

abstract contract IDataSource {

    function baseToken() virtual public view returns (address);

    function fetchPrice(address token) virtual public view returns(bool success, uint256 price);

    function fetchLiquidity(address token) virtual public view returns(bool success, uint256 tokenLiquidity, uint256 baseLiquidity);

    function fetchPriceAndLiquidity(address token) virtual public view returns(bool success, uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity);

}
