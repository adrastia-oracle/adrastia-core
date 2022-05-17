// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../oracles/AggregatedOracle.sol";

contract AggregatedOracleStub is AggregatedOracle {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool quoteTokenDecimalsOverridden;
        uint8 quoteTokenDecimals;
        bool validateUnderlyingConsultationOverridden;
        bool validateUnderlyingConsultation;
        bool sanityCheckTvlDistributionRatioOverridden;
        bool sanityCheckTvlDistributionRatio;
        bool sanityCheckQuoteTokenLiquidityOverridden;
        bool sanityCheckQuoteTokenLiquidity;
        bool sanityCheckTokenLiquidityValueOverridden;
        bool sanityCheckTokenLiquidityValue;
    }

    Config public config;

    constructor(
        string memory quoteTokenName_,
        address quoteTokenAddress_,
        string memory quoteTokenSymbol_,
        uint8 quoteTokenDecimals_,
        address[] memory oracles_,
        AggregatedOracle.TokenSpecificOracle[] memory _tokenSpecificOracles,
        uint256 period_,
        uint256 minimumTokenLiquidityValue_,
        uint256 minimumQuoteTokenLiquidity_
    )
        AggregatedOracle(
            quoteTokenName_,
            quoteTokenAddress_,
            quoteTokenSymbol_,
            quoteTokenDecimals_,
            oracles_,
            _tokenSpecificOracles,
            period_,
            minimumTokenLiquidityValue_,
            minimumQuoteTokenLiquidity_
        )
    {
        overrideValidateUnderlyingConsultation(true, true); // Skip validation by default
    }

    function stubSetQuoteTokenDecimals(uint8 decimals) public {
        config.quoteTokenDecimalsOverridden = true;
        config.quoteTokenDecimals = decimals;
    }

    function stubSetObservation(
        address token,
        uint112 price,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity,
        uint32 timestamp
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

    function stubSanityCheckTvlDistributionRatio(
        address token,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) public view returns (bool) {
        return sanityCheckTvlDistributionRatio(token, price, tokenLiquidity, quoteTokenLiquidity);
    }

    function stubSanityCheckQuoteTokenLiquidity(uint256 quoteTokenLiquidity) public view returns (bool) {
        return sanityCheckQuoteTokenLiquidity(quoteTokenLiquidity);
    }

    function stubSanityCheckTokenLiquidityValue(
        address token,
        uint256 price,
        uint256 tokenLiquidity
    ) public view returns (bool) {
        return sanityCheckTokenLiquidityValue(token, price, tokenLiquidity);
    }

    function stubValidateUnderlyingConsultation(
        address token,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) public view returns (bool) {
        return validateUnderlyingConsultation(token, price, tokenLiquidity, quoteTokenLiquidity);
    }

    function overrideValidateUnderlyingConsultation(bool overridden, bool validateUnderlyingConsultation_) public {
        config.validateUnderlyingConsultationOverridden = overridden;
        config.validateUnderlyingConsultation = validateUnderlyingConsultation_;
    }

    function overrideSanityCheckTvlDistributionRatio(bool overridden, bool sanityCheckTvlDistributionRatio_) public {
        config.sanityCheckTvlDistributionRatioOverridden = overridden;
        config.sanityCheckTvlDistributionRatio = sanityCheckTvlDistributionRatio_;
    }

    function overrideSanityCheckQuoteTokenLiquidity(bool overridden, bool sanityCheckQuoteTokenLiquidity_) public {
        config.sanityCheckQuoteTokenLiquidityOverridden = overridden;
        config.sanityCheckQuoteTokenLiquidity = sanityCheckQuoteTokenLiquidity_;
    }

    function overrideSanityCheckTokenLiquidityValue(bool overridden, bool sanityCheckTokenLiquidityValue_) public {
        config.sanityCheckTokenLiquidityValueOverridden = overridden;
        config.sanityCheckTokenLiquidityValue = sanityCheckTokenLiquidityValue_;
    }

    /* Overridden functions */

    function needsUpdate(bytes memory data) public view virtual override(IUpdateable, PeriodicOracle) returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return PeriodicOracle.needsUpdate(data);
    }

    function quoteTokenDecimals() public view virtual override returns (uint8) {
        if (config.quoteTokenDecimalsOverridden) return config.quoteTokenDecimals;
        else return super.quoteTokenDecimals();
    }

    function validateUnderlyingConsultation(
        address token,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) internal view virtual override returns (bool) {
        if (config.validateUnderlyingConsultationOverridden) return config.validateUnderlyingConsultation;
        else return super.validateUnderlyingConsultation(token, price, tokenLiquidity, quoteTokenLiquidity);
    }

    function sanityCheckTvlDistributionRatio(
        address token,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) internal view virtual override returns (bool) {
        if (config.sanityCheckTvlDistributionRatioOverridden) return config.sanityCheckTvlDistributionRatio;
        else return super.sanityCheckTvlDistributionRatio(token, price, tokenLiquidity, quoteTokenLiquidity);
    }

    function sanityCheckQuoteTokenLiquidity(uint256 quoteTokenLiquidity) internal view virtual override returns (bool) {
        if (config.sanityCheckQuoteTokenLiquidityOverridden) return config.sanityCheckQuoteTokenLiquidity;
        else return super.sanityCheckQuoteTokenLiquidity(quoteTokenLiquidity);
    }

    function sanityCheckTokenLiquidityValue(
        address token,
        uint256 price,
        uint256 tokenLiquidity
    ) internal view virtual override returns (bool) {
        if (config.sanityCheckTokenLiquidityValueOverridden) return config.sanityCheckTokenLiquidityValue;
        else return super.sanityCheckTokenLiquidityValue(token, price, tokenLiquidity);
    }
}
