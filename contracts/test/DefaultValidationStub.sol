//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../strategies/validation/DefaultValidation.sol";

contract DefaultValidationStub is DefaultValidation {
    struct Config {
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
        uint8 quoteTokenDecimals_,
        uint256 minimumTokenLiquidityValue_,
        uint256 minimumQuoteTokenLiquidity_,
        uint256 minimumLiquidityRatio_,
        uint256 maximumLiquidityRatio_
    )
        DefaultValidation(
            quoteTokenDecimals_,
            minimumTokenLiquidityValue_,
            minimumQuoteTokenLiquidity_,
            minimumLiquidityRatio_,
            maximumLiquidityRatio_
        )
    {}

    function stubSanityCheckTvlDistributionRatio(
        address /*token*/,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) public view returns (bool) {
        return sanityCheckTvlDistributionRatio(price, tokenLiquidity, quoteTokenLiquidity);
    }

    function stubSanityCheckQuoteTokenLiquidity(uint256 quoteTokenLiquidity) public view returns (bool) {
        return sanityCheckQuoteTokenLiquidity(quoteTokenLiquidity);
    }

    function stubSanityCheckTokenLiquidityValue(
        address /*token*/,
        uint256 price,
        uint256 tokenLiquidity
    ) public view returns (bool) {
        return sanityCheckTokenLiquidityValue(price, tokenLiquidity);
    }

    function stubValidate(
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) public view returns (bool) {
        return validate(price, tokenLiquidity, quoteTokenLiquidity);
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

    function validate(
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) internal view virtual override returns (bool) {
        if (config.validateUnderlyingConsultationOverridden) return config.validateUnderlyingConsultation;
        else return super.validate(price, tokenLiquidity, quoteTokenLiquidity);
    }

    function sanityCheckTvlDistributionRatio(
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity
    ) internal view virtual override returns (bool) {
        if (config.sanityCheckTvlDistributionRatioOverridden) return config.sanityCheckTvlDistributionRatio;
        else return super.sanityCheckTvlDistributionRatio(price, tokenLiquidity, quoteTokenLiquidity);
    }

    function sanityCheckQuoteTokenLiquidity(uint256 quoteTokenLiquidity) internal view virtual override returns (bool) {
        if (config.sanityCheckQuoteTokenLiquidityOverridden) return config.sanityCheckQuoteTokenLiquidity;
        else return super.sanityCheckQuoteTokenLiquidity(quoteTokenLiquidity);
    }

    function sanityCheckTokenLiquidityValue(
        uint256 price,
        uint256 tokenLiquidity
    ) internal view virtual override returns (bool) {
        if (config.sanityCheckTokenLiquidityValueOverridden) return config.sanityCheckTokenLiquidityValue;
        else return super.sanityCheckTokenLiquidityValue(price, tokenLiquidity);
    }
}
