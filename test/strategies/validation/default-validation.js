const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const MINIMUM_TOKEN_LIQUIDITY_VALUE = BigNumber.from(0);
const MINIMUM_QUOTE_TOKEN_LIQUIDITY = BigNumber.from(0);
const MINIMUM_LIQUIDITY_RATIO = 1000; // 1:10 value(token):value(quoteToken)
const MAXIMUM_LIQUIDITY_RATIO = 100000; // 10:1 value(token):value(quoteToken)

describe("DefaultValidation#sanityCheckQuoteTokenLiquidity", function () {
    var factory;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("DefaultValidationStub");
    });

    const tests = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
        ethers.constants.MaxUint256,
    ];

    const expectedReturn = (minimumQuoteTokenLiquidity, quoteTokenLiquidity) => {
        if (quoteTokenLiquidity.lt(minimumQuoteTokenLiquidity)) {
            return false;
        }

        return true;
    };

    for (const minimumQuoteTokenLiquidity of tests) {
        describe("Minimum quote token liquidity = " + minimumQuoteTokenLiquidity, function () {
            var validationStrategy;

            beforeEach(async function () {
                const quoteTokenDecimals = 6;

                validationStrategy = await factory.deploy(
                    quoteTokenDecimals,
                    MINIMUM_TOKEN_LIQUIDITY_VALUE,
                    minimumQuoteTokenLiquidity,
                    MINIMUM_LIQUIDITY_RATIO,
                    MAXIMUM_LIQUIDITY_RATIO
                );
            });

            for (const quoteTokenLiquidity of tests) {
                if (quoteTokenLiquidity.gt(0)) {
                    it(
                        "Should return " +
                            expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.sub(1)) +
                            " when quoteTokenLiquidity = " +
                            quoteTokenLiquidity.sub(1),
                        async function () {
                            expect(
                                await validationStrategy.stubSanityCheckQuoteTokenLiquidity(quoteTokenLiquidity.sub(1))
                            ).to.equal(expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.sub(1)));
                        }
                    );
                }

                it(
                    "Should return " +
                        expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity) +
                        " when quoteTokenLiquidity = " +
                        quoteTokenLiquidity,
                    async function () {
                        expect(
                            await validationStrategy.stubSanityCheckQuoteTokenLiquidity(quoteTokenLiquidity)
                        ).to.equal(expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity));
                    }
                );

                if (quoteTokenLiquidity.lt(ethers.constants.MaxUint256)) {
                    it(
                        "Should return " +
                            expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.add(1)) +
                            " when quoteTokenLiquidity = " +
                            quoteTokenLiquidity.add(1),
                        async function () {
                            expect(
                                await validationStrategy.stubSanityCheckQuoteTokenLiquidity(quoteTokenLiquidity.add(1))
                            ).to.equal(expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.add(1)));
                        }
                    );
                }
            }
        });
    }
});

describe("DefaultValidation#sanityCheckTokenLiquidityValue", function () {
    var factory;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("DefaultValidationStub");
    });

    const tests = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
        ethers.constants.MaxUint256,
    ];

    const liquidities = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
    ];

    const prices = [
        BigNumber.from(0),
        BigNumber.from(1),
        ethers.utils.parseUnits("1.0", 6),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000", 18),
    ];

    const tokenDecimals = [0, 1, 6, 18];

    const tokenLiquidityValue = (price, tokenLiquidity, tokenDecimals) => {
        return price.mul(tokenLiquidity).div(ethers.utils.parseUnits("1", tokenDecimals));
    };

    const expectedReturn = (minimumTokenLiquidityValue, price, tokenLiquidity, tokenDecimals) => {
        const quoteTokenLiquidityValue = tokenLiquidityValue(price, tokenLiquidity, tokenDecimals);

        if (quoteTokenLiquidityValue.lt(minimumTokenLiquidityValue)) {
            return false;
        }

        return true;
    };

    for (const quoteTokenDecimals of tokenDecimals) {
        describe("Quote token decimals = " + quoteTokenDecimals, function () {
            for (const liquidityDecimals of tokenDecimals) {
                describe("Liquidity decimals = " + liquidityDecimals, function () {
                    for (const minimumTokenLiquidityValue of tests) {
                        describe("Minimum token liquidity value = " + minimumTokenLiquidityValue, function () {
                            var validationStrategy;

                            beforeEach(async function () {
                                validationStrategy = await factory.deploy(
                                    quoteTokenDecimals,
                                    minimumTokenLiquidityValue,
                                    MINIMUM_QUOTE_TOKEN_LIQUIDITY,
                                    MINIMUM_LIQUIDITY_RATIO,
                                    MAXIMUM_LIQUIDITY_RATIO
                                );
                            });

                            for (const price of prices) {
                                describe("Price = " + price, function () {
                                    for (const tokenLiquidity of liquidities) {
                                        describe("Token liquidity = " + tokenLiquidity, function () {
                                            it(
                                                "Should return " +
                                                    expectedReturn(
                                                        minimumTokenLiquidityValue,
                                                        price,
                                                        tokenLiquidity,
                                                        quoteTokenDecimals
                                                    ) +
                                                    " when tokenLiquidityValue = " +
                                                    tokenLiquidityValue(price, tokenLiquidity, quoteTokenDecimals),
                                                async function () {
                                                    expect(
                                                        await validationStrategy.stubSanityCheckTokenLiquidityValue(
                                                            AddressZero,
                                                            price,
                                                            tokenLiquidity
                                                        )
                                                    ).to.equal(
                                                        expectedReturn(
                                                            minimumTokenLiquidityValue,
                                                            price,
                                                            tokenLiquidity,
                                                            quoteTokenDecimals
                                                        )
                                                    );
                                                }
                                            );
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});

describe("DefaultValidation#sanityCheckTvlDistributionRatio", function () {
    var validationStrategy;
    var factory;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("DefaultValidationStub");

        const quoteTokenDecimals = 6;

        validationStrategy = await factory.deploy(
            quoteTokenDecimals,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY,
            MINIMUM_LIQUIDITY_RATIO,
            MAXIMUM_LIQUIDITY_RATIO
        );
    });

    const liquidities = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
        ethers.utils.parseUnits("1100000000", 18),
    ];

    const prices = [
        BigNumber.from(0),
        BigNumber.from(1),
        ethers.utils.parseUnits("1.0", 6),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000", 18),
    ];

    const tokenDecimals = [0, 1, 6, 18];

    const tvlDistributionRatio = (price, tokenLiquidity, quoteTokenLiquidity, quoteTokenDecimals) => {
        if (quoteTokenLiquidity.eq(0)) {
            return BigNumber.from(0);
        }

        return price
            .mul(tokenLiquidity)
            .mul(10000)
            .div(ethers.utils.parseUnits("1", quoteTokenDecimals))
            .div(quoteTokenLiquidity);
    };

    const expectedReturn = (price, tokenLiquidity, quoteTokenLiquidity, quoteTokenDecimals) => {
        if (quoteTokenLiquidity.eq(0)) {
            return false;
        }

        const ratio = tvlDistributionRatio(price, tokenLiquidity, quoteTokenLiquidity, quoteTokenDecimals);

        if (ratio.lt(MINIMUM_LIQUIDITY_RATIO) || ratio.gt(MAXIMUM_LIQUIDITY_RATIO)) {
            // below 1:10 or above 10:1
            return false;
        }

        return true;
    };

    for (const decimals of tokenDecimals) {
        describe("Quote token decimals = " + decimals, function () {
            beforeEach(async function () {
                const quoteTokenDecimals = decimals;

                validationStrategy = await factory.deploy(
                    quoteTokenDecimals,
                    MINIMUM_TOKEN_LIQUIDITY_VALUE,
                    MINIMUM_QUOTE_TOKEN_LIQUIDITY,
                    MINIMUM_LIQUIDITY_RATIO,
                    MAXIMUM_LIQUIDITY_RATIO
                );
            });

            for (const price of prices) {
                describe("Price = " + price, function () {
                    for (const tokenLiquidity of liquidities) {
                        describe("Token liquidity = " + tokenLiquidity, function () {
                            for (const quoteTokenLiquidity of liquidities) {
                                describe("Quote token liquidity = " + tokenLiquidity, function () {
                                    it(
                                        "Should return " +
                                            expectedReturn(price, tokenLiquidity, quoteTokenLiquidity, decimals) +
                                            " when tvl distribution ratio = " +
                                            tvlDistributionRatio(price, tokenLiquidity, quoteTokenLiquidity, decimals),
                                        async function () {
                                            expect(
                                                await validationStrategy.stubSanityCheckTvlDistributionRatio(
                                                    AddressZero,
                                                    price,
                                                    tokenLiquidity,
                                                    quoteTokenLiquidity
                                                )
                                            ).to.equal(
                                                expectedReturn(price, tokenLiquidity, quoteTokenLiquidity, decimals)
                                            );
                                        }
                                    );
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});

describe("DefaultValidation#validate", function () {
    var factory;
    var validationStrategy;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("DefaultValidationStub");

        const quoteTokenDecimals = 6;

        validationStrategy = await factory.deploy(
            quoteTokenDecimals,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY,
            MINIMUM_LIQUIDITY_RATIO,
            MAXIMUM_LIQUIDITY_RATIO
        );
    });

    const tests = [true, false];

    const expectedReturn = (
        sanityCheckTvlDistributionRatio,
        sanityCheckQuoteTokenLiquidity,
        sanityCheckTokenLiquidityValue
    ) => {
        return sanityCheckQuoteTokenLiquidity && sanityCheckTvlDistributionRatio && sanityCheckTokenLiquidityValue;
    };

    for (const sanityCheckTvlDistributionRatio of tests) {
        describe("Sanity check tvl distribution ratio = " + sanityCheckTvlDistributionRatio, function () {
            for (const sanityCheckQuoteTokenLiquidity of tests) {
                describe("Sanity check quote token liquidity = " + sanityCheckQuoteTokenLiquidity, function () {
                    for (const sanityCheckTokenLiquidityValue of tests) {
                        describe("Sanity check token liquidity value = " + sanityCheckTokenLiquidityValue, function () {
                            it(
                                "Should return " +
                                    expectedReturn(
                                        sanityCheckTvlDistributionRatio,
                                        sanityCheckQuoteTokenLiquidity,
                                        sanityCheckTokenLiquidityValue
                                    ),
                                async function () {
                                    await validationStrategy.overrideValidateUnderlyingConsultation(false, false);

                                    await validationStrategy.overrideSanityCheckTvlDistributionRatio(
                                        true,
                                        sanityCheckTvlDistributionRatio
                                    );
                                    await validationStrategy.overrideSanityCheckQuoteTokenLiquidity(
                                        true,
                                        sanityCheckQuoteTokenLiquidity
                                    );
                                    await validationStrategy.overrideSanityCheckTokenLiquidityValue(
                                        true,
                                        sanityCheckTokenLiquidityValue
                                    );

                                    // We input junk to stubValidate because we override everything
                                    expect(await validationStrategy.stubValidate(1, 1, 1)).to.equal(
                                        expectedReturn(
                                            sanityCheckTvlDistributionRatio,
                                            sanityCheckQuoteTokenLiquidity,
                                            sanityCheckTokenLiquidityValue
                                        )
                                    );
                                }
                            );
                        });
                    }
                });
            }
        });
    }
});

describe("DefaultValidation#supportsInterface", function () {
    var interfaceIds;
    var validationStrategy;

    beforeEach(async () => {
        const factory = await ethers.getContractFactory("DefaultValidationStub");
        validationStrategy = await factory.deploy(
            6, // quoteTokenDecimals
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY,
            MINIMUM_LIQUIDITY_RATIO,
            MAXIMUM_LIQUIDITY_RATIO
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    beforeEach(async function () {
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IERC165", async function () {
        const interfaceId = await interfaceIds.iERC165();
        expect(await validationStrategy["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IValidationStrategy", async function () {
        const interfaceId = await interfaceIds.iValidationStrategy();
        expect(await validationStrategy["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
