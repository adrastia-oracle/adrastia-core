//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IERC20.sol";

import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";

import "../interfaces/IOracle.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract SafeAbstractOracle is IOracle {
    using LowGasSafeMath for uint256;

    address public immutable quoteToken;

    mapping(address => ObservationLibrary.Observation) public observations;

    constructor(address quoteToken_) {
        quoteToken = quoteToken_;
    }

    function update(address token) external virtual override returns (bool);

    function needsUpdate(address token) public view virtual override returns (bool);

    function quoteTokenAddress() public view virtual override returns (address) {
        return quoteToken;
    }

    function quoteTokenSymbol() public view virtual override returns (string memory) {
        return IERC20(quoteToken).symbol();
    }

    function consultPrice(address token) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");

        return observations[token].price;
    }

    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint256 price) {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp.add(maxAge), "AbstractOracle: RATE_TOO_OLD");

        return observation.price;
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");

        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function consultLiquidity(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp.add(maxAge), "AbstractOracle: RATE_TOO_OLD");

        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function consult(address token)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp.add(maxAge), "AbstractOracle: RATE_TOO_OLD");

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }
}
