//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IOracle.sol";
import "../interfaces/IDataSource.sol";
import "../interfaces/IPriceStrategy.sol";
import "../interfaces/ILiquidityStrategy.sol";

import "../libraries/ObservationLibrary.sol";

import "hardhat/console.sol";

contract SlidingWindowOracle is IOracle {

    address public immutable dataSource;

    address public immutable baseToken;

    mapping(address => ObservationLibrary.Observation) public observations;

    constructor(address dataSource_, address baseToken_) {
        require(IDataSource(dataSource_).baseToken() == baseToken_);
        dataSource = dataSource_;
        baseToken = baseToken_;
    }

    function update(address token) override external {
        IDataSource ds = IDataSource(dataSource);

        (bool priceSuccess, uint256 price) = ds.fetchPrice(token);
        (bool liquiditySuccess, uint256 tokenLiquidity, uint256 baseLiquidity) = ds.fetchLiquidity(token);

        if (priceSuccess && liquiditySuccess) {
            ObservationLibrary.Observation storage observation = observations[token];

            observation.price = price;
            observation.tokenLiquidity = tokenLiquidity;
            observation.baseLiquidity = baseLiquidity;
            observation.timestamp = block.timestamp;
        }

        // TODO: Handle cases where calls are not successful
    }

    function consult(address token) override virtual external view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        ObservationLibrary.Observation storage observation = observations[token];

        return (observation.price, observation.tokenLiquidity, observation.baseLiquidity);
    }
}