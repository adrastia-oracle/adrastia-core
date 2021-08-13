//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

import "../interfaces/IDataSource.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";

contract UniswapV3DataSource is IDataSource {

    uint32 immutable public observationPeriod = 10;

    uint24 immutable public uniswapPoolFee;

    address immutable public uniswapFactory;

    address immutable private _baseToken;

    constructor(address uniswapFactory_, address baseToken_, uint24 uniswapPoolFee_) {
        uniswapFactory = uniswapFactory_;
        _baseToken = baseToken_;
        uniswapPoolFee = uniswapPoolFee_;
    }

    function baseToken() override virtual public view returns (address) {
        return _baseToken;
    }

    function fetchPriceAndLiquidity(address token) override virtual public returns(bool success, uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity) {
        address poolAddress = PoolAddress.computeAddress(uniswapFactory, PoolAddress.getPoolKey(token, baseToken(), uniswapPoolFee));

        int24 timeWeightedAverageTick = OracleLibrary.consult(poolAddress, observationPeriod);

        price = OracleLibrary.getQuoteAtTick(timeWeightedAverageTick, uint128(10**(ERC20(token).decimals())), token, baseToken());

        tokenLiquidity = ERC20(token).balanceOf(poolAddress);
        baseLiquidity = ERC20(baseToken()).balanceOf(poolAddress);

        success = true;
    }

    function fetchPrice(address token) override virtual public returns(bool success, uint256 price) {
        address poolAddress = PoolAddress.computeAddress(uniswapFactory, PoolAddress.getPoolKey(token, baseToken(), uniswapPoolFee));

        int24 timeWeightedAverageTick = OracleLibrary.consult(poolAddress, observationPeriod);

        price = OracleLibrary.getQuoteAtTick(timeWeightedAverageTick, uint128(10**(ERC20(token).decimals())), token, baseToken());
        success = true;
    }

    function fetchLiquidity(address token) override virtual public returns(bool success, uint256 tokenLiquidity, uint256 baseLiquidity) {
        address poolAddress = PoolAddress.computeAddress(uniswapFactory, PoolAddress.getPoolKey(token, baseToken(), uniswapPoolFee));

        tokenLiquidity = ERC20(token).balanceOf(poolAddress);
        baseLiquidity = ERC20(baseToken()).balanceOf(poolAddress);
        success = true;
    }

}
