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

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

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

const TWO_PERCENT_CHANGE = 2000000;
const MIN_UPDATE_DELAY = 10000;
const MAX_UPDATE_DELAY = 30000;

function describeAlgebraLiquidityAccumulatorTests(contractName, stubContractName, averagingStrategyName) {
    describe(contractName + " using " + averagingStrategyName, function () {
        var averagingStrategy;

        beforeEach(async function () {
            const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
            averagingStrategy = await averagingStrategyFactory.deploy();
            await averagingStrategy.deployed();
        });

        describe(contractName + "#constructor", function () {
            var uniswapFactory;
            var poolDeployer;

            beforeEach(async () => {
                const uniswapFactoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
                const poolDeployerFactory = await ethers.getContractFactory(DEPLOYER_ABI, DEPLOYER_BYTECODE);

                poolDeployer = await poolDeployerFactory.deploy();
                await poolDeployer.deployed();

                uniswapFactory = await uniswapFactoryFactory.deploy(poolDeployer.address, ethers.constants.AddressZero);
                await uniswapFactory.deployed();
            });

            it("Should properly set liquidity decimals to 0", async function () {
                const accumulatorFactory = await ethers.getContractFactory(contractName);
                const accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    poolDeployer.address,
                    INIT_CODE_HASH,
                    USDC,
                    0, // Liquidity decimals
                    TWO_PERCENT_CHANGE,
                    MIN_UPDATE_DELAY,
                    MAX_UPDATE_DELAY
                );

                expect(await accumulator.liquidityDecimals()).equals(0);
                expect(await accumulator.quoteTokenDecimals()).equals(0);
            });

            it("Should properly set liquidity decimals to 18", async function () {
                const accumulatorFactory = await ethers.getContractFactory(contractName);
                const accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    poolDeployer.address,
                    INIT_CODE_HASH,
                    USDC,
                    18, // Liquidity decimals
                    TWO_PERCENT_CHANGE,
                    MIN_UPDATE_DELAY,
                    MAX_UPDATE_DELAY
                );

                expect(await accumulator.liquidityDecimals()).equals(18);
                expect(await accumulator.quoteTokenDecimals()).equals(18);
            });
        });

        describe(contractName, function () {
            this.timeout(100000);

            var uniswapFactory;
            var poolDeployer;
            var liquidityAccumulator;
            var addressHelper;

            var expectedTokenLiquidity;
            var expectedQuoteTokenLiquidity;

            var quoteToken;
            var token;
            var ltToken;
            var gtToken;

            const tests = [
                { args: [ethers.utils.parseUnits("10000", 18), ethers.utils.parseUnits("10000", 18)] },
                { args: [ethers.utils.parseUnits("100000", 18), ethers.utils.parseUnits("10000", 18)] },
                { args: [ethers.utils.parseUnits("10000", 18), ethers.utils.parseUnits("100000", 18)] },
            ];

            beforeEach(async () => {
                const erc20Factory = await ethers.getContractFactory("FakeERC20");
                const uniswapFactoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
                const poolDeployerFactory = await ethers.getContractFactory(DEPLOYER_ABI, DEPLOYER_BYTECODE);
                const liquidityAccumulatorFactory = await ethers.getContractFactory(stubContractName);
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

                liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
                    averagingStrategy.address,
                    poolDeployer.address,
                    INIT_CODE_HASH,
                    quoteToken.address,
                    0, // Liquidity decimals
                    TWO_PERCENT_CHANGE,
                    MIN_UPDATE_DELAY,
                    MAX_UPDATE_DELAY
                );
                await liquidityAccumulator.deployed();

                helper = await helperFactory.deploy(
                    uniswapFactory.address,
                    poolDeployer.address,
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
                );

                expectedTokenLiquidity = BigNumber.from(0);
                expectedQuoteTokenLiquidity = BigNumber.from(0);
            });

            describe(contractName + "#canUpdate", function () {
                describe("Can't update when", function () {
                    it("token = address(0)", async function () {
                        expect(await liquidityAccumulator.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(
                            false
                        );
                    });

                    it("token = quoteToken", async function () {
                        expect(
                            await liquidityAccumulator.canUpdate(ethers.utils.hexZeroPad(quoteToken.address, 32))
                        ).to.equal(false);
                    });
                });

                describe("Can update when", function () {
                    it("token != quoteToken", async function () {
                        expect(
                            await liquidityAccumulator.canUpdate(ethers.utils.hexZeroPad(token.address, 32))
                        ).to.equal(true);
                    });
                });
            });

            describe(contractName + "#fetchLiquidity", function () {
                async function createPool(sqrtPrice, fee = 3000) {
                    await uniswapFactory.createPool(token.address, quoteToken.address);

                    const pool = await uniswapFactory.poolByPair(token.address, quoteToken.address);
                    const poolContract = await ethers.getContractAt(POOL_ABI, pool);

                    poolContract.initialize(sqrtPrice);
                }

                async function addLiquidity(tokenLiquidity, quoteTokenLiquidity, fee = 3000) {
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
                        expectedTokenLiquidity = expectedTokenLiquidity.add(
                            rAmount0.div(BigNumber.from(10).pow(await token.decimals()))
                        );
                        expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(
                            rAmount1.div(BigNumber.from(10).pow(await quoteToken.decimals()))
                        );
                    } else {
                        expectedTokenLiquidity = expectedTokenLiquidity.add(
                            rAmount1.div(BigNumber.from(10).pow(await token.decimals()))
                        );
                        expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(
                            rAmount0.div(BigNumber.from(10).pow(await quoteToken.decimals()))
                        );
                    }
                }

                it("Shouldn't revert when there are no pools", async function () {
                    await expect(liquidityAccumulator.harnessFetchLiquidity(token.address)).to.not.be.reverted;
                });

                it("Should revert if token == quoteToken", async function () {
                    await expect(liquidityAccumulator.harnessFetchLiquidity(quoteToken.address)).to.be.reverted;
                });

                it("Should revert if token == address(0)", async function () {
                    await expect(liquidityAccumulator.harnessFetchLiquidity(AddressZero)).to.be.reverted;
                });

                it("Pools with zero in-range liquidity should be ignored", async function () {
                    const sqrtPrice = encodePriceSqrt(
                        ethers.utils.parseUnits("1.0", 18),
                        ethers.utils.parseUnits("1.0", 18)
                    );
                    await createPool(sqrtPrice, 3000); // Initialize pool

                    // Get pool address
                    const pool = await uniswapFactory.poolByPair(token.address, quoteToken.address);

                    // Transfer tokens to pool (but do not mint)
                    await token.approve(pool, MaxUint256);
                    await quoteToken.approve(pool, MaxUint256);
                    await token.transfer(pool, ethers.utils.parseUnits("10000.0", 18));
                    await quoteToken.transfer(pool, ethers.utils.parseUnits("10000.0", 18));

                    const [tokenLiquidity, quoteTokenLiquidity] = await liquidityAccumulator.harnessFetchLiquidity(
                        token.address
                    );

                    expect(tokenLiquidity).to.equal(0);
                    expect(quoteTokenLiquidity).to.equal(0);
                });

                function liquidityTests(poolFees) {
                    tests.forEach(({ args }) => {
                        it(`Should get liquidities {tokenLiqudity = ${args[0]}, quoteTokenLiquidity = ${args[1]}}`, async () => {
                            const sqrtPrice = (await addressHelper.lessThan(token.address, quoteToken.address))
                                ? encodePriceSqrt(args[1], args[0])
                                : encodePriceSqrt(args[0], args[1]);

                            var tokenLiquiditySum = BigNumber.from(0);
                            var quoteTokenLiquiditySum = BigNumber.from(0);

                            for (fee of poolFees) {
                                await createPool(sqrtPrice, fee);
                                await addLiquidity(args[0], args[1], fee);

                                tokenLiquiditySum = tokenLiquiditySum.add(
                                    args[0].div(BigNumber.from(10).pow(await token.decimals()))
                                );
                                quoteTokenLiquiditySum = quoteTokenLiquiditySum.add(
                                    args[1].div(BigNumber.from(10).pow(await quoteToken.decimals()))
                                );
                            }

                            const [tokenLiquidity, quoteTokenLiquidity] =
                                await liquidityAccumulator.harnessFetchLiquidity(token.address);

                            // Verify liquidities based off what our helper reports
                            {
                                // Allow 1% difference to account for fees and Uniswap math precision loss
                                const expectedTokenLiquidityFloor = expectedTokenLiquidity.sub(
                                    expectedTokenLiquidity.div(100)
                                );
                                const expectedTokenLiquidityCeil = expectedTokenLiquidity.add(
                                    expectedTokenLiquidity.div(100)
                                );

                                const expectedQuoteTokenLiquidityFloor = expectedQuoteTokenLiquidity.sub(
                                    expectedQuoteTokenLiquidity.div(100)
                                );
                                const expectedQuoteTokenLiquidityCeil = expectedQuoteTokenLiquidity.add(
                                    expectedQuoteTokenLiquidity.div(100)
                                );

                                expect(tokenLiquidity).to.be.within(
                                    expectedTokenLiquidityFloor,
                                    expectedTokenLiquidityCeil
                                );
                                expect(quoteTokenLiquidity).to.be.within(
                                    expectedQuoteTokenLiquidityFloor,
                                    expectedQuoteTokenLiquidityCeil
                                );
                            }

                            // Verify liquidities based off our input
                            {
                                // Allow 1% difference to account for fees and Uniswap math precision loss
                                const expectedTokenLiquidityFloor = tokenLiquiditySum.sub(tokenLiquiditySum.div(100));
                                const expectedTokenLiquidityCeil = tokenLiquiditySum.add(tokenLiquiditySum.div(100));

                                const expectedQuoteTokenLiquidityFloor = quoteTokenLiquiditySum.sub(
                                    quoteTokenLiquiditySum.div(100)
                                );
                                const expectedQuoteTokenLiquidityCeil = quoteTokenLiquiditySum.add(
                                    quoteTokenLiquiditySum.div(100)
                                );

                                expect(tokenLiquidity).to.be.within(
                                    expectedTokenLiquidityFloor,
                                    expectedTokenLiquidityCeil
                                );
                                expect(quoteTokenLiquidity).to.be.within(
                                    expectedQuoteTokenLiquidityFloor,
                                    expectedQuoteTokenLiquidityCeil
                                );
                            }
                        });
                    });
                }

                describe("token = ltToken", function () {
                    beforeEach(async function () {
                        token = ltToken;
                    });

                    liquidityTests([3000]);
                });

                describe("token = gtToken", function () {
                    beforeEach(async function () {
                        token = gtToken;
                    });

                    liquidityTests([3000]);
                });
            });
        });
    });
}

describeAlgebraLiquidityAccumulatorTests(
    "AlgebraLiquidityAccumulator",
    "AlgebraLiquidityAccumulatorStub",
    "ArithmeticAveraging"
);
describeAlgebraLiquidityAccumulatorTests(
    "AlgebraLiquidityAccumulator",
    "AlgebraLiquidityAccumulatorStub",
    "GeometricAveraging"
);
describeAlgebraLiquidityAccumulatorTests(
    "AlgebraLiquidityAccumulator",
    "AlgebraLiquidityAccumulatorStub",
    "HarmonicAveragingWS80"
);
