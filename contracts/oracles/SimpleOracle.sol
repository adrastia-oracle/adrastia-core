//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IOracle.sol";
import "../interfaces/IDataSource.sol";

import "../libraries/ObservationLibrary.sol";

import "hardhat/console.sol";

contract SimpleOracle is IOracle {

    address public immutable dataSource;

    address public immutable quoteToken;

    mapping(address => ObservationLibrary.Observation) public observations;

    constructor(address dataSource_, address quoteToken_) {
        require(IDataSource(dataSource_).quoteToken() == quoteToken_);
        dataSource = dataSource_;
        quoteToken = quoteToken_;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        token; // Silence un-used warning

        return false; // TODO ?
    }

    function update(address token) override external {
        IDataSource ds = IDataSource(dataSource);

        (bool success, uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity) = ds.fetchPriceAndLiquidity(token);

        if (success) {
            ObservationLibrary.Observation storage observation = observations[token];

            observation.price = price;
            observation.tokenLiquidity = tokenLiquidity;
            observation.baseLiquidity = baseLiquidity;
            observation.timestamp = block.timestamp;
        }

        // TODO: Handle cases where calls are not successful
    }

    function consult(address token) override virtual public view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        ObservationLibrary.Observation storage consultation = observations[token];

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        baseLiquidity = consultation.baseLiquidity;
    }

    function consultFresh(address token) override virtual public view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        (,price, tokenLiquidity, baseLiquidity) = IDataSource(dataSource).fetchPriceAndLiquidity(token);
    }
}