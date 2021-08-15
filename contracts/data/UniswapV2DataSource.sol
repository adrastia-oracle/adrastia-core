//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

import "../interfaces/IDataSource.sol";

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

contract UniswapV2DataSource is IDataSource {

    using SafeMath for uint256;

    uint256 constant private PRECISION = 1e8;

    address immutable public uniswapFactory;

    address immutable public override quoteToken;

    constructor(address uniswapFactory_, address quoteToken_) {
        uniswapFactory = uniswapFactory_;
        quoteToken = quoteToken_;
    }

    function fetchPriceAndLiquidity(address token) override virtual public view returns(bool success, uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity) {
        address pairAddress = IUniswapV2Factory(uniswapFactory).getPair(token, quoteToken);
        if (pairAddress == address(0))
            return (false, 0, 0, 0);

        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

        (uint256 reserve0, uint256 reserve1, uint32 timestamp) = pair.getReserves();
        if (timestamp == 0)
            return (false, 0, 0, 0); // No prior information from the pair, return failure

        if (pair.token0() == token) {
            tokenLiquidity = reserve0;
            baseLiquidity = reserve1;
        } else {
            tokenLiquidity = reserve1;
            baseLiquidity = reserve0;
        }

        uint256 wholeUnitAmount = computeWholeUnitAmount(token);
        price = baseLiquidity.mul(PRECISION).mul(wholeUnitAmount).div(tokenLiquidity).div(PRECISION);

        success = true;
    }

    function fetchPrice(address token) override virtual public view returns(bool success, uint256 price) {
        (success, price,,) = fetchPriceAndLiquidity(token);
    }

    function fetchLiquidity(address token) override virtual public view returns(bool success, uint256 tokenLiquidity, uint256 baseLiquidity) {
        (success,, tokenLiquidity, baseLiquidity) = fetchPriceAndLiquidity(token);
    }

    function computeWholeUnitAmount(address token) private view returns(uint256 amount) {
        amount = uint256(10) ** IERC20(token).decimals();
    }

}