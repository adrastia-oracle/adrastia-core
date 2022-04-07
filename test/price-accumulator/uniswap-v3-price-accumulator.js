const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;
const bn = require("bignumber.js");

const {
    abi: FACTORY_ABI,
    bytecode: FACTORY_BYTECODE,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");

const { abi: POOL_ABI } = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

const INIT_CODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;

const POOL_FEES = [3000, 123];

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

describe("UniswapV3PriceAccumulator#calculatePriceFromSqrtPrice", function () {
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

        for (var i = 0; i < tokens.length; ++i) tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
        for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

        tokens = tokens.sort(async (a, b) => await addressHelper.lessThan(a.address, b.address));

        token = ltToken = tokens[0];
        quoteToken = tokens[1];
        gtToken = tokens[2];

        const accumulatorFactory = await ethers.getContractFactory("UniswapV3PriceAccumulatorStub");

        accumulator = await accumulatorFactory.deploy(
            AddressZero,
            INIT_CODE_HASH,
            POOL_FEES,
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

describe("UniswapV3PriceAccumulator#computeWholeUnitAmount", function () {
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
        const accumulatorFactory = await ethers.getContractFactory("UniswapV3PriceAccumulatorStub");

        accumulator = await accumulatorFactory.deploy(
            AddressZero,
            INIT_CODE_HASH,
            POOL_FEES,
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

describe("UniswapV3PriceAccumulator#computeAddress", function () {
    var accumulator;

    beforeEach(async () => {
        const accumulatorFactory = await ethers.getContractFactory("UniswapV3PriceAccumulatorStub");

        accumulator = await accumulatorFactory.deploy(
            AddressZero,
            INIT_CODE_HASH,
            POOL_FEES,
            AddressZero,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
    });

    it("Reverts when token0 == token1", async function () {
        const key = {
            token0: AddressZero,
            token1: AddressZero,
            fee: 3000,
        };
        await expect(accumulator.stubComputeAddress(AddressZero, INIT_CODE_HASH, key)).to.be.reverted;
    });

    it("Reverts when token0 > token1", async function () {
        const key = {
            token0: "0x52bc44d5378309ee2abf1539bf71de1b7d7be3b5",
            token1: AddressZero,
            fee: 3000,
        };
        await expect(accumulator.stubComputeAddress(AddressZero, INIT_CODE_HASH, key)).to.be.reverted;
    });
});

describe("UniswapV3PriceAccumulator", function () {
    var quoteToken;
    var token;
    var ltToken;
    var gtToken;

    var uniswapFactory;
    var accumulator;
    var addressHelper;
    var helper;

    var expectedTokenLiquidity;
    var expectedQuoteTokenLiquidity;
    var expectedPrice;

    async function createPool(sqrtPrice, fee = 3000) {
        await uniswapFactory.createPool(token.address, quoteToken.address, fee);

        const pool = await uniswapFactory.getPool(token.address, quoteToken.address, fee);
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
            fee: fee,
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
        const accumulatorFactory = await ethers.getContractFactory("UniswapV3PriceAccumulatorStub");
        const helperFactory = await ethers.getContractFactory("UniswapV3Helper");
        const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

        addressHelper = await addressHelperFactory.deploy();

        var tokens = [undefined, undefined, undefined];

        for (var i = 0; i < tokens.length; ++i) tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
        for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

        tokens = tokens.sort(async (a, b) => await addressHelper.lessThan(a.address, b.address));

        token = ltToken = tokens[0];
        quoteToken = tokens[1];
        gtToken = tokens[2];

        uniswapFactory = await uniswapFactoryFactory.deploy(owner.getAddress());
        await uniswapFactory.deployed();

        accumulator = await accumulatorFactory.deploy(
            uniswapFactory.address,
            INIT_CODE_HASH,
            POOL_FEES,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );

        helper = await helperFactory.deploy(uniswapFactory.address, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

        expectedTokenLiquidity = BigNumber.from(0);
        expectedQuoteTokenLiquidity = BigNumber.from(0);
        expectedPrice = BigNumber.from(0);
    });

    describe("UniswapV3PriceAccumulator#canUpdate", function () {
        describe("Can't update when", function () {
            it("token = address(0)", async function () {
                expect(await accumulator.canUpdate(AddressZero)).to.equal(false);
            });

            it("token = quoteToken", async function () {
                expect(await accumulator.canUpdate(quoteToken.address)).to.equal(false);
            });

            it("The pool doesn't exist", async function () {
                expect(await accumulator.canUpdate(token.address)).to.equal(false);
            });

            it("The pool has no liquidity", async function () {
                const initialPrice = encodePriceSqrt(
                    ethers.utils.parseUnits("10.0", 18),
                    ethers.utils.parseUnits("10.0", 18)
                );

                await createPool(initialPrice);

                expect(await accumulator.canUpdate(token.address)).to.equal(false);
            });
        });

        describe("Can update when", function () {
            it("The pool exists and has liquidity", async function () {
                const initialPrice = encodePriceSqrt(
                    ethers.utils.parseUnits("10.0", 18),
                    ethers.utils.parseUnits("10.0", 18)
                );

                await createPool(initialPrice);
                await mint(ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18));

                expect(await accumulator.canUpdate(token.address)).to.equal(true);
            });
        });
    });

    describe("UniswapV3PriceAccumulator#fetchPrice", function () {
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
                        const initialPrice = (await addressHelper.greaterThan(token.address, quoteToken.address))
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
                await expect(accumulator.stubFetchPrice(token.address)).to.be.revertedWith(
                    "UniswapV3PriceAccumulator: NO_LIQUIDITY"
                );
            });

            it("The pools have no liquidity", async function () {
                const initialPrice = encodePriceSqrt(
                    ethers.utils.parseUnits("10.0", 18),
                    ethers.utils.parseUnits("10.0", 18)
                );

                await createPool(initialPrice);

                await expect(accumulator.stubFetchPrice(token.address)).to.be.revertedWith(
                    "UniswapV3PriceAccumulator: NO_LIQUIDITY"
                );
            });

            it("token = address(0)", async function () {
                await expect(accumulator.stubFetchPrice(AddressZero)).to.be.revertedWith(
                    "UniswapV3PriceAccumulator: ZERO_ADDRESS"
                );
            });

            it("token = quoteToken", async function () {
                await expect(accumulator.stubFetchPrice(quoteToken.address)).to.be.revertedWith(
                    "UniswapV3PriceAccumulator: IDENTICAL_ADDRESSES"
                );
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
