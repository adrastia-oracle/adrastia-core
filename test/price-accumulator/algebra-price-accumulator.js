const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;
const bn = require("bignumber.js");

const { abi: FACTORY_ABI, bytecode: FACTORY_BYTECODE } = require("../vendor/algebra/AlgebraFactory.json");
const { abi: DEPLOYER_ABI, bytecode: DEPLOYER_BYTECODE } = require("../vendor/algebra/AlgebraPoolDeployer.json");

const { abi: POOL_ABI } = require("../vendor/algebra/AlgebraPool.json");

const INIT_CODE_HASH = "0x6ec6c9c8091d160c0aa74b2b14ba9c1717e95093bd3ac085cee99a49aab294a4";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// returns the sqrt price as a 64x96
// https://github.com/Uniswap/v3-core/blob/c05a0e2c8c08c460fb4d05cfdda30b3ad8deeaac/test/shared/utilities.ts#L63
function encodePriceSqrt(reserve1, reserve0) {
    return BigNumber.from(
        new bn(reserve1.toString())
            .div(reserve0.toString())
            .sqrt()
            .multipliedBy(new bn(2).pow(96))
            .integerValue(3)
            .toString()
    );
}

const TICK_SPACINGS = {
    500: 10,
    3000: 60,
    10000: 200,
};

const getMinTick = (tickSpacing) => Math.ceil(-887272 / tickSpacing) * tickSpacing;
const getMaxTick = (tickSpacing) => Math.floor(887272 / tickSpacing) * tickSpacing;

function describeAlgebraPriceAccumulatorTests(contractName, stubContractName, averagingStrategyName) {
    describe(contractName + " using " + averagingStrategyName, function () {
        var averagingStrategy;

        beforeEach(async function () {
            const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
            averagingStrategy = await averagingStrategyFactory.deploy();
            await averagingStrategy.deployed();
        });

        describe(contractName + "#calculatePriceFromSqrtPrice", function () {
            var quoteToken;
            var token;
            var ltToken;
            var gtToken;

            var accumulator;

            beforeEach(async () => {
                const erc20Factory = await ethers.getContractFactory("FakeERC20");
                const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

                addressHelper = await addressHelperFactory.deploy();

                var tokens = [undefined, undefined, undefined];

                for (var i = 0; i < tokens.length; ++i)
                    tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
                for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

                tokens = tokens.sort(async (a, b) => await addressHelper.lessThan(a.address, b.address));

                token = ltToken = tokens[0];
                quoteToken = tokens[1];
                gtToken = tokens[2];

                const accumulatorFactory = await ethers.getContractFactory(stubContractName);

                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    AddressZero,
                    INIT_CODE_HASH,
                    AddressZero,
                    TWO_PERCENT_CHANGE,
                    MIN_UPDATE_DELAY,
                    MAX_UPDATE_DELAY
                );
            });
            const tests = [
                {
                    tokenAmount: BigNumber.from(2).pow(128),
                    quoteTokenAmount: BigNumber.from(2),
                },
                {
                    tokenAmount: BigNumber.from(2),
                    quoteTokenAmount: BigNumber.from(2).pow(128),
                },
            ];

            function describeTests() {
                tests.forEach(function ({ tokenAmount, quoteTokenAmount }) {
                    it(`Calculates correct price with tokenAmount = ${tokenAmount} and quoteTokenAmount = ${quoteTokenAmount}`, async function () {
                        const sqrtPrice = (await addressHelper.greaterThan(token.address, quoteToken.address))
                            ? encodePriceSqrt(tokenAmount, quoteTokenAmount)
                            : encodePriceSqrt(quoteTokenAmount, tokenAmount);

                        const wholeUnitAmount = BigNumber.from(10).pow(await token.decimals());
                        const price = await accumulator.stubCalculatePriceFromSqrtPrice(
                            token.address,
                            quoteToken.address,
                            sqrtPrice,
                            wholeUnitAmount
                        );

                        // Allow for 1% loss of precision
                        const expectedPriceFloor = price.sub(price.div(100));
                        const expectedPriceCeil = price.add(price.div(100));

                        expect(price).to.be.within(expectedPriceFloor, expectedPriceCeil);
                    });
                });
            }

            describe("token < quoteToken", function () {
                beforeEach(async () => {
                    token = ltToken;
                });

                describeTests();
            });

            describe("token > quoteToken", function () {
                beforeEach(async () => {
                    token = gtToken;
                });

                describeTests();
            });
        });

        describe(contractName + "#computeWholeUnitAmount", function () {
            var accumulator;

            const tests = [
                {
                    decimals: 0,
                    wholeUnitAmount: BigNumber.from(1),
                },
                {
                    decimals: 1,
                    wholeUnitAmount: BigNumber.from(10),
                },
                {
                    decimals: 6,
                    wholeUnitAmount: BigNumber.from(1000000),
                },
                {
                    decimals: 18,
                    wholeUnitAmount: BigNumber.from("1000000000000000000"),
                },
            ];

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);

                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    AddressZero,
                    INIT_CODE_HASH,
                    AddressZero,
                    TWO_PERCENT_CHANGE,
                    MIN_UPDATE_DELAY,
                    MAX_UPDATE_DELAY
                );
            });

            tests.forEach(({ decimals, wholeUnitAmount }) => {
                it(`Should verify that a token with ${decimals} decimals has a whole unit amount of ${wholeUnitAmount.toString()}`, async () => {
                    const erc20Factory = await ethers.getContractFactory("FakeERC20");

                    const token = await erc20Factory.deploy("Token", "T", decimals);
                    await token.deployed();

                    expect(await accumulator.stubComputeWholeUnitAmount(token.address)).to.equal(wholeUnitAmount);
                });
            });
        });

        describe(contractName, function () {
            var quoteToken;
            var token;
            var ltToken;
            var gtToken;

            var uniswapFactory;
            var poolDeployer;
            var accumulator;
            var addressHelper;
            var helper;

            var expectedTokenLiquidity;
            var expectedQuoteTokenLiquidity;
            var expectedPrice;

            async function createPool(sqrtPrice, fee = 3000) {
                await uniswapFactory.createPool(token.address, quoteToken.address);

                const pool = await uniswapFactory.poolByPair(token.address, quoteToken.address);
                const poolContract = await ethers.getContractAt(POOL_ABI, pool);

                await poolContract.initialize(sqrtPrice);
            }

            async function mint(tokenLiquidity, quoteTokenLiquidity, fee = 3000) {
                const [owner] = await ethers.getSigners();

                var token0;
                var token1;

                var amount0;
                var amount1;

                if (await addressHelper.lessThan(token.address, quoteToken.address)) {
                    token0 = token.address;
                    token1 = quoteToken.address;

                    amount0 = tokenLiquidity;
                    amount1 = quoteTokenLiquidity;
                } else {
                    token1 = token.address;
                    token0 = quoteToken.address;

                    amount1 = tokenLiquidity;
                    amount0 = quoteTokenLiquidity;
                }

                const params = {
                    token0: token0,
                    token1: token1,
                    recipient: owner.address,
                    tickLower: getMinTick(TICK_SPACINGS[fee]),
                    tickUpper: getMaxTick(TICK_SPACINGS[fee]),
                    amount0Desired: amount0,
                    amount1Desired: amount1,
                    amount0Min: 0,
                    amount1Min: 0,
                };

                await token.approve(helper.address, MaxUint256);
                await quoteToken.approve(helper.address, MaxUint256);

                const [, rAmount0, rAmount1] = await helper.callStatic.helperAddLiquidity(params);

                await helper.helperAddLiquidity(params);

                if (await addressHelper.lessThan(token.address, quoteToken.address)) {
                    expectedTokenLiquidity = expectedTokenLiquidity.add(rAmount0);
                    expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(rAmount1);
                } else {
                    expectedTokenLiquidity = expectedTokenLiquidity.add(rAmount1);
                    expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(rAmount0);
                }

                const decimalFactor = BigNumber.from(10).pow(await token.decimals());
                const precisionFactor = BigNumber.from(10).pow(6);

                expectedPrice = expectedQuoteTokenLiquidity
                    .mul(precisionFactor)
                    .mul(decimalFactor)
                    .div(expectedTokenLiquidity)
                    .div(precisionFactor);
            }

            beforeEach(async () => {
                const [owner] = await ethers.getSigners();

                const erc20Factory = await ethers.getContractFactory("FakeERC20");
                const uniswapFactoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
                const poolDeployerFactory = await ethers.getContractFactory(DEPLOYER_ABI, DEPLOYER_BYTECODE);
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                const helperFactory = await ethers.getContractFactory("AlgebraHelper");
                const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

                addressHelper = await addressHelperFactory.deploy();

                var tokens = [undefined, undefined, undefined];

                for (var i = 0; i < tokens.length; ++i)
                    tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
                for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

                if (await addressHelper.lessThan(tokens[0].address, tokens[1].address)) {
                    // tokens[0] < tokens[1]
                    if (await addressHelper.lessThan(tokens[2].address, tokens[0].address)) {
                        // tokens[2] < tokens[0] < tokens[1]
                        ltToken = tokens[2];
                        quoteToken = tokens[0];
                        gtToken = tokens[1];
                    } else if (await addressHelper.lessThan(tokens[2].address, tokens[1].address)) {
                        // tokens[0] < tokens[2] < tokens[1]
                        ltToken = tokens[0];
                        quoteToken = tokens[2];
                        gtToken = tokens[1];
                    } else {
                        // tokens[0] < tokens[1] < tokens[2]
                        ltToken = tokens[0];
                        quoteToken = tokens[1];
                        gtToken = tokens[2];
                    }
                } else {
                    // tokens[1] < tokens[0]
                    if (await addressHelper.lessThan(tokens[2].address, tokens[1].address)) {
                        // tokens[2] < tokens[1] < tokens[0]
                        ltToken = tokens[2];
                        quoteToken = tokens[1];
                        gtToken = tokens[0];
                    } else if (await addressHelper.lessThan(tokens[2].address, tokens[0].address)) {
                        // tokens[1] < tokens[2] < tokens[0]
                        ltToken = tokens[1];
                        quoteToken = tokens[2];
                        gtToken = tokens[0];
                    } else {
                        // tokens[1] < tokens[0] < tokens[2]
                        ltToken = tokens[1];
                        quoteToken = tokens[0];
                        gtToken = tokens[2];
                    }
                }

                expect(await addressHelper.lessThan(ltToken.address, quoteToken.address)).to.be.true;
                expect(await addressHelper.lessThan(quoteToken.address, gtToken.address)).to.be.true;

                token = ltToken;

                poolDeployer = await poolDeployerFactory.deploy();
                await poolDeployer.deployed();

                uniswapFactory = await uniswapFactoryFactory.deploy(poolDeployer.address, ethers.constants.AddressZero);
                await uniswapFactory.deployed();

                await poolDeployer.setFactory(uniswapFactory.address);

                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    poolDeployer.address,
                    INIT_CODE_HASH,
                    quoteToken.address,
                    TWO_PERCENT_CHANGE,
                    MIN_UPDATE_DELAY,
                    MAX_UPDATE_DELAY
                );

                helper = await helperFactory.deploy(
                    uniswapFactory.address,
                    poolDeployer.address,
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
                );

                expectedTokenLiquidity = BigNumber.from(0);
                expectedQuoteTokenLiquidity = BigNumber.from(0);
                expectedPrice = BigNumber.from(0);
            });

            describe(contractName + "#canUpdate", function () {
                describe("Can't update when", function () {
                    it("token = address(0)", async function () {
                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
                    });

                    it("token = quoteToken", async function () {
                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(quoteToken.address, 32))).to.equal(
                            false
                        );
                    });

                    it("The pool doesn't exist", async function () {
                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(token.address, 32))).to.equal(false);
                    });

                    it("The pool has no liquidity", async function () {
                        const initialPrice = encodePriceSqrt(
                            ethers.utils.parseUnits("10.0", 18),
                            ethers.utils.parseUnits("10.0", 18)
                        );

                        await createPool(initialPrice);

                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(token.address, 32))).to.equal(false);
                    });
                });

                describe("Can update when", function () {
                    it("The pool exists and has liquidity", async function () {
                        const initialPrice = encodePriceSqrt(
                            ethers.utils.parseUnits("10.0", 18),
                            ethers.utils.parseUnits("10.0", 18)
                        );

                        await createPool(initialPrice);
                        await mint(ethers.utils.parseUnits("1000.0", 18), ethers.utils.parseUnits("1000.0", 18));

                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(token.address, 32))).to.equal(true);
                    });
                });
            });

            describe(contractName + "#fetchPrice", function () {
                const tests = [
                    {
                        tokenAmount: ethers.utils.parseUnits("1000.0", 18),
                        quoteTokenAmount: ethers.utils.parseUnits("1000.0", 18),
                    },
                    {
                        tokenAmount: ethers.utils.parseUnits("1000.0", 18),
                        quoteTokenAmount: ethers.utils.parseUnits("10000.0", 18),
                    },
                    {
                        tokenAmount: ethers.utils.parseUnits("10000.0", 18),
                        quoteTokenAmount: ethers.utils.parseUnits("1000.0", 18),
                    },
                    {
                        tokenAmount: ethers.utils.parseUnits("3000.0", 18),
                        quoteTokenAmount: ethers.utils.parseUnits("5000.0", 18),
                    },
                    {
                        tokenAmount: ethers.utils.parseUnits("5000.0", 18),
                        quoteTokenAmount: ethers.utils.parseUnits("3000.0", 18),
                    },
                    {
                        // This case results in a price of 0 in most cases (depends on decimals)
                        tokenAmount: ethers.utils.parseUnits("5000000000.0", 18),
                        quoteTokenAmount: ethers.utils.parseUnits("3000.0", 18),
                    },
                ];

                function calculatePrice(tokenAmount, quoteTokenAmount, tokenDecimals) {
                    const wholeTokenAmount = BigNumber.from(10).pow(tokenDecimals);

                    var price = quoteTokenAmount.mul(wholeTokenAmount).div(tokenAmount);

                    return price;
                }

                function describeFetchPriceTests(tokenDecimals, quoteTokenDecimals) {
                    describe(`token decimals = ${tokenDecimals}, quote token decimals = ${quoteTokenDecimals}`, function () {
                        beforeEach(async () => {
                            await token.setDecimals(tokenDecimals);
                            await quoteToken.setDecimals(quoteTokenDecimals);
                        });

                        tests.forEach(({ tokenAmount, quoteTokenAmount }) => {
                            it(`fetchPrice(token) = ${calculatePrice(
                                tokenAmount,
                                quoteTokenAmount,
                                tokenDecimals
                            )} with tokenAmount = ${tokenAmount} and quoteTokenAmount = ${quoteTokenAmount}`, async function () {
                                const initialPrice = (await addressHelper.greaterThan(
                                    token.address,
                                    quoteToken.address
                                ))
                                    ? encodePriceSqrt(tokenAmount, quoteTokenAmount)
                                    : encodePriceSqrt(quoteTokenAmount, tokenAmount);

                                await createPool(initialPrice);
                                await mint(tokenAmount, quoteTokenAmount);

                                const reportedPrice = await accumulator.stubFetchPrice(token.address);
                                const expectedPrice = calculatePrice(tokenAmount, quoteTokenAmount, tokenDecimals);

                                if (expectedPrice == 0) {
                                    // 1 is reported rather than 0 for two reasons:
                                    // 1. So that it can be used in harmonic means without problem (i.e. divide by zero)
                                    // 2. Contracts may assume a price of 0 to be invalid
                                    expect(reportedPrice).to.equal(1);
                                } else {
                                    const expectedPriceFloor = expectedPrice.sub(expectedPrice.div(100)).sub(1);
                                    const expectedPriceCeil = expectedPrice.add(expectedPrice.div(100)).add(1);

                                    expect(reportedPrice).to.be.within(expectedPriceFloor, expectedPriceCeil);
                                }
                            });
                        });
                    });
                }

                describe("Should revert when", function () {
                    it("No pools exist", async function () {
                        await expect(accumulator.stubFetchPrice(token.address)).to.be.revertedWith("NoLiquidity");
                    });

                    it("The pools have no liquidity", async function () {
                        const initialPrice = encodePriceSqrt(
                            ethers.utils.parseUnits("10.0", 18),
                            ethers.utils.parseUnits("10.0", 18)
                        );

                        await createPool(initialPrice);

                        await expect(accumulator.stubFetchPrice(token.address)).to.be.revertedWith("NoLiquidity");
                    });

                    it("token = address(0)", async function () {
                        await expect(accumulator.stubFetchPrice(AddressZero)).to.be.revertedWith("InvalidToken");
                    });

                    it("token = quoteToken", async function () {
                        await expect(accumulator.stubFetchPrice(quoteToken.address)).to.be.revertedWith("InvalidToken");
                    });
                });

                describe("token < quoteToken", function () {
                    beforeEach(async () => {
                        token = ltToken;
                    });

                    describeFetchPriceTests(6, 18);
                    describeFetchPriceTests(18, 18);
                    describeFetchPriceTests(6, 6);
                    describeFetchPriceTests(18, 6);
                });

                describe("token > quoteToken", function () {
                    beforeEach(async () => {
                        token = gtToken;
                    });

                    describeFetchPriceTests(6, 18);
                    describeFetchPriceTests(18, 18);
                    describeFetchPriceTests(6, 6);
                    describeFetchPriceTests(18, 6);
                });
            });
        });
    });
}

describeAlgebraPriceAccumulatorTests("AlgebraPriceAccumulator", "AlgebraPriceAccumulatorStub", "ArithmeticAveraging");
describeAlgebraPriceAccumulatorTests("AlgebraPriceAccumulator", "AlgebraPriceAccumulatorStub", "GeometricAveraging");
describeAlgebraPriceAccumulatorTests(
    "AlgebraPriceAccumulator",
    "AlgebraPriceAccumulatorStub",
    "HarmonicAveragingWS192"
);
