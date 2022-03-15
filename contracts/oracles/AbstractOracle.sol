//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";

import "../interfaces/IOracle.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract AbstractOracle is IERC165, IOracle {
    address public immutable quoteToken;

    mapping(address => ObservationLibrary.Observation) public observations;

    constructor(address quoteToken_) {
        quoteToken = quoteToken_;
    }

    function update(address token) external virtual override returns (bool);

    function needsUpdate(address token) public view virtual override returns (bool);

    function quoteTokenName() public view virtual override returns (string memory) {
        return IERC20Metadata(quoteToken).name();
    }

    function quoteTokenAddress() public view virtual override returns (address) {
        return quoteToken;
    }

    function quoteTokenSymbol() public view virtual override returns (string memory) {
        return IERC20Metadata(quoteToken).symbol();
    }

    function quoteTokenDecimals() public view virtual override returns (uint8) {
        return IERC20Metadata(quoteToken).decimals();
    }

    function consultPrice(address token) public view virtual override returns (uint256 price) {
        if (token == quoteTokenAddress()) return 10**quoteTokenDecimals();

        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");

        return observation.price;
    }

    function consultPrice(address token, uint256 maxAge) public view virtual override returns (uint256 price) {
        if (token == quoteTokenAddress()) return 10**quoteTokenDecimals();

        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "AbstractOracle: RATE_TOO_OLD");

        return observation.price;
    }

    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        if (token == quoteTokenAddress()) return (0, 0);

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
        if (token == quoteTokenAddress()) return (0, 0);

        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "AbstractOracle: RATE_TOO_OLD");

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
        if (token == quoteTokenAddress()) return (10**quoteTokenDecimals(), 0, 0);

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
        if (token == quoteTokenAddress()) return (10**quoteTokenDecimals(), 0, 0);

        ObservationLibrary.Observation storage observation = observations[token];

        require(observation.timestamp != 0, "AbstractOracle: MISSING_OBSERVATION");
        require(block.timestamp <= observation.timestamp + maxAge, "AbstractOracle: RATE_TOO_OLD");

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IOracle).interfaceId ||
            interfaceId == type(IUpdateByToken).interfaceId ||
            interfaceId == type(IPriceOracle).interfaceId ||
            interfaceId == type(ILiquidityOracle).interfaceId;
    }
}
