// SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "../../oracles/AggregatedOracle.sol";

contract AggregatedOracleStub is AggregatedOracle {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool quoteTokenDecimalsOverridden;
        uint8 quoteTokenDecimals;
    }

    Config public config;

    constructor(
        string memory quoteTokenName_,
        address quoteTokenAddress_,
        string memory quoteTokenSymbol_,
        uint8 quoteTokenDecimals_,
        address[] memory oracles_,
        AggregatedOracle.TokenSpecificOracle[] memory _tokenSpecificOracles,
        uint256 period_
    )
        AggregatedOracle(
            quoteTokenName_,
            quoteTokenAddress_,
            quoteTokenSymbol_,
            quoteTokenDecimals_,
            oracles_,
            _tokenSpecificOracles,
            period_
        )
    {}

    function stubSetQuoteTokenDecimals(uint8 decimals) public {
        config.quoteTokenDecimalsOverridden = true;
        config.quoteTokenDecimals = decimals;
    }

    function stubSetObservation(
        address token,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity,
        uint256 timestamp
    ) public {
        ObservationLibrary.Observation storage observation = observations[token];

        observation.price = price;
        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
        observation.timestamp = timestamp;
    }

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    /* Overridden functions */

    function needsUpdate(address token) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(token);
    }

    function quoteTokenDecimals() public view virtual override returns (uint8) {
        if (config.quoteTokenDecimalsOverridden) return config.quoteTokenDecimals;
        else return super.quoteTokenDecimals();
    }
}
