const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ln } = require("@prb/math");
const { fromBn, toBn } = require("evm-bn");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

const MAX_CUMULATIVE_VALUE = BigNumber.from(2).pow(112).sub(1);
const MAX_SUPPORTED_LIQUIDITY = BigNumber.from(10).pow(9); // 1 billion

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function describeLiquidityAccumulatorTests(
    contractName,
    stubContractName,
    stubCallerContractName,
    calculateTimeWeightedValue
) {
    describe(contractName + "#fetchLiquidity", function () {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var liquidityAccumulator;

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            liquidityAccumulator = await LiquidityAccumulator.deploy(
                USDC,
                TWO_PERCENT_CHANGE,
                minUpdateDelay,
                maxUpdateDelay
            );
            await liquidityAccumulator.deployed();

            // Configure liquidity
            await liquidityAccumulator.setLiquidity(GRT, 100, 100);

            // Override changeThresholdPassed (true)
            await liquidityAccumulator.overrideChangeThresholdPassed(true, true);
        });

        const tests = [
            [0, 0],
            [1, 1],
            [10, 5],
            [ethers.utils.parseUnits("101.0", 18), ethers.utils.parseUnits("102.0", 18)],
        ];

        for (const test of tests) {
            it(`tokenLiquidity = ${test[0].toString()}, quoteTokenLiquidity = ${test[1].toString()}`, async function () {
                // Configure liquidity
                await liquidityAccumulator.setLiquidity(GRT, test[0], test[1]);

                const { tokenLiquidity, quoteTokenLiquidity } = await liquidityAccumulator.stubFetchLiquidity(GRT);

                expect(tokenLiquidity).to.equal(test[0]);
                expect(quoteTokenLiquidity).to.equal(test[1]);
            });
        }
    });

    describe(contractName + "#heartbeat", function () {
        const minUpdateDelay = 1;

        var accumulatorFactory;

        beforeEach(async () => {
            accumulatorFactory = await ethers.getContractFactory(stubContractName);
        });

        const tests = [30, 1800, 86400];

        for (const heartbeat of tests) {
            it(`Return ${heartbeat} when set by the constructor`, async function () {
                const liquidityAccumulator = await accumulatorFactory.deploy(
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    heartbeat
                );

                expect(await liquidityAccumulator.heartbeat()).to.equal(heartbeat);
            });
        }
    });

    describe(contractName + "#getCurrentAccumulation", function () {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var liquidityAccumulator;

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            liquidityAccumulator = await LiquidityAccumulator.deploy(
                USDC,
                TWO_PERCENT_CHANGE,
                minUpdateDelay,
                maxUpdateDelay
            );
            await liquidityAccumulator.deployed();
        });

        it("Reverts if the last observation is uninitialized", async function () {
            await expect(liquidityAccumulator.getCurrentAccumulation(GRT)).to.be.revertedWith(
                "LiquidityAccumulator: UNINITIALIZED"
            );
        });
    });

    describe(contractName + "#needsUpdate", () => {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var liquidityAccumulator;

        var updateTime;

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            liquidityAccumulator = await LiquidityAccumulator.deploy(
                USDC,
                TWO_PERCENT_CHANGE,
                minUpdateDelay,
                maxUpdateDelay
            );
            await liquidityAccumulator.deployed();

            // Configure liquidity
            await liquidityAccumulator.setLiquidity(GRT, 100, 100);

            // Override changeThresholdPassed (false)
            await liquidityAccumulator.overrideChangeThresholdPassed(true, false);

            // Override validateObservation
            await liquidityAccumulator.overrideValidateObservation(true, true);

            // Time increases by 1 second with each block mined
            await hre.timeAndMine.setTimeIncrease(1);

            // Initial update
            const updateReceipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));
            updateTime = (await ethers.provider.getBlock(updateReceipt.blockNumber)).timestamp;
        });

        it("Shouldn't need update if delta time is less than the min update delay (update threshold passed)", async () => {
            // changeThresholdPassed = true
            await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

            // deltaTime = 1
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

            // deltaTime = minUpdateDelay - 1
            await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
        });

        it("Shouldn't need update if delta time is less than the min update delay (update threshold not passed)", async () => {
            // deltaTime = 1
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

            // deltaTime = minUpdateDelay - 1
            await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
        });

        it("Should need update if delta time is within min and max update delay (update threshold passed)", async () => {
            // changeThresholdPassed = true
            await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

            // deltaTime = minUpdateDelay
            await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

            // deltaTime = maxUpdateDelay - 1
            await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
        });

        it("Shouldn't need update if delta time is within min and max update delay (update threshold not passed)", async () => {
            // deltaTime = minUpdateDelay
            await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

            // deltaTime = maxUpdateDelay - 1
            await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
        });

        it("Should need update if delta time is >= max update delay (update threshold passed)", async () => {
            // changeThresholdPassed = true
            await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

            // deltaTime = maxUpdateDelay
            await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

            // deltaTime = maxUpdateDelay + 1
            await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
        });

        it("Should need update if delta time is >= max update delay (update threshold not passed)", async () => {
            // deltaTime = maxUpdateDelay
            await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

            // deltaTime = maxUpdateDelay + 1
            await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
            expect(await liquidityAccumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
        });
    });

    describe(contractName + "#canUpdate", () => {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var accumulator;

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            accumulator = await LiquidityAccumulator.deploy(USDC, TWO_PERCENT_CHANGE, minUpdateDelay, maxUpdateDelay);
        });

        describe("Can't update when it", function () {
            it("Doesn't need an update", async function () {
                await accumulator.overrideNeedsUpdate(true, false);

                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
            });
        });

        describe("Can update when it", function () {
            beforeEach(async () => {
                await accumulator.overrideNeedsUpdate(true, true);
            });

            it("Needs an update", async function () {
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
            });
        });
    });

    describe(contractName + "#changeThresholdSurpassed", () => {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var liquidityAccumulator;

        const tests = [
            { args: [0, 0, TWO_PERCENT_CHANGE], expected: false },
            { args: [0, 100, TWO_PERCENT_CHANGE], expected: true },
            { args: [100, 0, TWO_PERCENT_CHANGE], expected: true },
            { args: [100, 101, TWO_PERCENT_CHANGE], expected: false },
            { args: [100, 102, TWO_PERCENT_CHANGE], expected: true },
            { args: [100, 103, TWO_PERCENT_CHANGE], expected: true },
            { args: [100, 1000000, TWO_PERCENT_CHANGE], expected: true },
            { args: [101, 100, TWO_PERCENT_CHANGE], expected: false },
            { args: [102, 100, TWO_PERCENT_CHANGE], expected: true },
            { args: [103, 100, TWO_PERCENT_CHANGE], expected: true },
            { args: [1000000, 100, TWO_PERCENT_CHANGE], expected: true },
            { args: [BigNumber.from(2).pow(256).sub(1), 100, TWO_PERCENT_CHANGE], expected: true },
            { args: [100, BigNumber.from(2).pow(256).sub(1), TWO_PERCENT_CHANGE], expected: true },
            {
                args: [BigNumber.from(2).pow(256).sub(1), BigNumber.from(2).pow(256).sub(1), TWO_PERCENT_CHANGE],
                expected: false,
            },
            {
                args: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18), TWO_PERCENT_CHANGE],
                expected: false,
            },
            {
                args: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.02", 18), TWO_PERCENT_CHANGE],
                expected: true,
            },
            {
                args: [ethers.utils.parseUnits("1.02", 18), ethers.utils.parseUnits("1.0", 18), TWO_PERCENT_CHANGE],
                expected: true,
            },
            {
                args: [
                    ethers.utils.parseUnits("1000000000.0", 18),
                    ethers.utils.parseUnits("1020000000.0", 18),
                    TWO_PERCENT_CHANGE,
                ],
                expected: true,
            },
            {
                args: [
                    ethers.utils.parseUnits("1020000000.0", 18),
                    ethers.utils.parseUnits("1000000000.0", 18),
                    TWO_PERCENT_CHANGE,
                ],
                expected: true,
            },
        ];

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            liquidityAccumulator = await LiquidityAccumulator.deploy(
                USDC,
                TWO_PERCENT_CHANGE,
                minUpdateDelay,
                maxUpdateDelay
            );
            await liquidityAccumulator.deployed();
        });

        tests.forEach(({ args, expected }) => {
            it(`Should evaluate to ${expected} with liquidities {${args[0]}, ${args[1]}} and update threshold ${args[3]}`, async () => {
                const received = await liquidityAccumulator.harnessChangeThresholdSurpassed(args[0], args[1], args[2]);
                expect(received).to.equal(expected);
            });
        });
    });

    describe(contractName + "#calculateLiquidity", () => {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var liquidityAccumulator;
        var mathUtil;

        const tests = [
            {
                firstAccumulation: { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                deltaTime: 1,
                liquidity: [ethers.utils.parseUnits("1.0", 6), ethers.utils.parseUnits("1.0", 6)],
            },
            {
                firstAccumulation: { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                deltaTime: 1,
                liquidity: [BigNumber.from(0), ethers.utils.parseUnits("1.0", 6)],
            },
            {
                firstAccumulation: { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                deltaTime: 1,
                liquidity: [ethers.utils.parseUnits("1.0", 6), BigNumber.from(0)],
            },
            {
                firstAccumulation: {
                    cumulativeTokenLiquidity: 1000000,
                    cumulativeQuoteTokenLiquidity: 1000000,
                    timestamp: 1,
                },
                deltaTime: 1,
                liquidity: [BigNumber.from(0), BigNumber.from(0)],
            },
            {
                firstAccumulation: {
                    cumulativeTokenLiquidity: 1000000,
                    cumulativeQuoteTokenLiquidity: 1000000,
                    timestamp: 1,
                },
                deltaTime: 1,
                liquidity: [ethers.utils.parseUnits("1000000.0", 6), ethers.utils.parseUnits("1000000.0", 6)],
            },
            {
                firstAccumulation: {
                    cumulativeTokenLiquidity: 1000000,
                    cumulativeQuoteTokenLiquidity: 1000000,
                    timestamp: 1,
                },
                deltaTime: 1,
                liquidity: [BigNumber.from(0), ethers.utils.parseUnits("1000000.0", 6)],
            },
            {
                firstAccumulation: {
                    cumulativeTokenLiquidity: 1000000,
                    cumulativeQuoteTokenLiquidity: 1000000,
                    timestamp: 1,
                },
                deltaTime: 1,
                liquidity: [ethers.utils.parseUnits("1000000.0", 6), BigNumber.from(0)],
            },
            {
                firstAccumulation: {
                    cumulativeTokenLiquidity: 1000000,
                    cumulativeQuoteTokenLiquidity: 1000000,
                    timestamp: 1,
                },
                deltaTime: 10,
                liquidity: [ethers.utils.parseUnits("100000.0", 6), ethers.utils.parseUnits("100000.0", 6)],
            },
            {
                firstAccumulation: {
                    cumulativeTokenLiquidity: 1000000,
                    cumulativeQuoteTokenLiquidity: 1000000,
                    timestamp: 100000,
                },
                deltaTime: 100000,
                liquidity: [ethers.utils.parseUnits("10.0", 6), ethers.utils.parseUnits("10.0", 6)],
            },
            {
                // **Overflow test**
                firstAccumulation: {
                    cumulativeTokenLiquidity: MAX_CUMULATIVE_VALUE,
                    cumulativeQuoteTokenLiquidity: MAX_CUMULATIVE_VALUE,
                    timestamp: 10,
                },
                deltaTime: 1,
                liquidity: [ethers.utils.parseUnits("10.0", 6), ethers.utils.parseUnits("10.0", 6)],
            },
        ];

        const revertedWithTests = [
            {
                args: [
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                ],
                expected: "LiquidityAccumulator: TIMESTAMP_CANNOT_BE_ZERO",
            },
            {
                args: [
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                ],
                expected: "LiquidityAccumulator: TIMESTAMP_CANNOT_BE_ZERO",
            },
            {
                args: [
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                ],
                expected: "LiquidityAccumulator: DELTA_TIME_CANNOT_BE_ZERO",
            },
            {
                args: [
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                    { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                ],
                expected: false, // Subtraction underflow
            },
        ];

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            liquidityAccumulator = await LiquidityAccumulator.deploy(
                USDC,
                TWO_PERCENT_CHANGE,
                minUpdateDelay,
                maxUpdateDelay
            );
            await liquidityAccumulator.deployed();

            const mathUtilFactory = await ethers.getContractFactory("MathUtil");
            mathUtil = await mathUtilFactory.deploy();
            await mathUtil.deployed();
        });

        tests.forEach(({ firstAccumulation, deltaTime, liquidity }) => {
            it(`Should evaluate to liquidity = ${
                liquidity[0].toString() + (liquidity[0].eq(0) ? " or 1" : "")
            } and quoteTokenLiquidity = ${
                liquidity[1].toString() + (liquidity[1].eq(0) ? " or 1" : "")
            } using firstAccumulation=${JSON.stringify(
                firstAccumulation
            )}, tokenLiquidity=${liquidity[0].toString()}, quoteTokenLiquidity=${liquidity[1].toString()}, deltaTime=${deltaTime}`, async () => {
                var secondCumulativeTokenLiquidity = BigNumber.from(firstAccumulation.cumulativeTokenLiquidity).add(
                    await calculateTimeWeightedValue(mathUtil, BigNumber.from(liquidity[0]), BigNumber.from(deltaTime))
                );
                var secondCumulativeQuoteTokenLiquidity = BigNumber.from(
                    firstAccumulation.cumulativeQuoteTokenLiquidity
                ).add(
                    await calculateTimeWeightedValue(mathUtil, BigNumber.from(liquidity[1]), BigNumber.from(deltaTime))
                );
                const secondTimestamp = firstAccumulation.timestamp + deltaTime;

                // Process overflows
                while (secondCumulativeTokenLiquidity.gt(MAX_CUMULATIVE_VALUE)) {
                    secondCumulativeTokenLiquidity = secondCumulativeTokenLiquidity.sub(
                        MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                    );
                }

                // Process overflows
                while (secondCumulativeQuoteTokenLiquidity.gt(MAX_CUMULATIVE_VALUE)) {
                    secondCumulativeQuoteTokenLiquidity = secondCumulativeQuoteTokenLiquidity.sub(
                        MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                    );
                }

                const secondAccumulation = {
                    cumulativeTokenLiquidity: secondCumulativeTokenLiquidity,
                    cumulativeQuoteTokenLiquidity: secondCumulativeQuoteTokenLiquidity,
                    timestamp: secondTimestamp,
                };

                const calculatedLiquidity = await liquidityAccumulator.calculateLiquidity(
                    firstAccumulation,
                    secondAccumulation
                );

                if (liquidity[0].eq(0)) {
                    // 0 and 1 both signal 0 price. We use 1 because of math errors with 0 (such as division).
                    expect(calculatedLiquidity["tokenLiquidity"]).to.be.within(0, 1);
                } else {
                    // Allow 0.001% error
                    expect(calculatedLiquidity["tokenLiquidity"]).to.be.closeTo(liquidity[0], liquidity[0].div(100000));
                }

                if (liquidity[1].eq(0)) {
                    // 0 and 1 both signal 0 price. We use 1 because of math errors with 0 (such as division).
                    expect(calculatedLiquidity["quoteTokenLiquidity"]).to.be.within(0, 1);
                } else {
                    // Allow 0.001% error
                    expect(calculatedLiquidity["quoteTokenLiquidity"]).to.be.closeTo(
                        liquidity[1],
                        liquidity[1].div(100000)
                    );
                }
            });
        });

        revertedWithTests.forEach(({ args, expected }) => {
            it(`Should revert${expected ? " with " + expected : ""} using accumulations {${JSON.stringify(
                args[0]
            )}, ${JSON.stringify(args[1])}}`, async () => {
                if (expected)
                    await expect(liquidityAccumulator.calculateLiquidity(args[0], args[1])).to.be.revertedWith(
                        expected
                    );
                else await expect(liquidityAccumulator.calculateLiquidity(args[0], args[1])).to.be.reverted;
            });
        });
    });

    describe(contractName + "#update", () => {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var liquidityAccumulator;
        var mathUtil;

        var startingTime;

        const initialUpdateTests = [
            /* Basic tests w/ no liquidity setting */
            {
                args: {
                    initialLiquidity: false,
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: false,
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            /* Tests without overrides */
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("200"),
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("200"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: MAX_SUPPORTED_LIQUIDITY,
                        quoteToken: MAX_SUPPORTED_LIQUIDITY,
                    },
                },
                expectedReturn: true,
            },
            /* Tests with overrides - needsUpdate = false */
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("200"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("200"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            {
                args: {
                    initialLiquidity: {
                        token: MAX_SUPPORTED_LIQUIDITY,
                        quoteToken: MAX_SUPPORTED_LIQUIDITY,
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: false,
                    },
                },
                expectedReturn: false,
            },
            /* Tests with overrides - needsUpdate = true */
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("200"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("200"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: MAX_SUPPORTED_LIQUIDITY,
                        quoteToken: MAX_SUPPORTED_LIQUIDITY,
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
        ];

        const secondUpdateTests = [
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("0"),
                        quoteToken: ethers.utils.parseEther("0"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("50"),
                        quoteToken: ethers.utils.parseEther("50"),
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("50"),
                        quoteToken: ethers.utils.parseEther("50"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                args: {
                    initialLiquidity: {
                        token: ethers.utils.parseEther("25"),
                        quoteToken: ethers.utils.parseEther("50"),
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("75"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
            {
                // ** Overflow test **
                args: {
                    initialLiquidity: {
                        token: MAX_SUPPORTED_LIQUIDITY,
                        quoteToken: MAX_SUPPORTED_LIQUIDITY,
                    },
                    initialCumulativeLiquidity: {
                        token: MAX_CUMULATIVE_VALUE,
                        quoteToken: MAX_CUMULATIVE_VALUE,
                    },
                    secondLiquidity: {
                        token: ethers.utils.parseEther("100"),
                        quoteToken: ethers.utils.parseEther("100"),
                    },
                    overrideNeedsUpdate: {
                        needsUpdate: true,
                    },
                },
                expectedReturn: true,
            },
        ];

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            liquidityAccumulator = await LiquidityAccumulator.deploy(
                USDC,
                TWO_PERCENT_CHANGE,
                minUpdateDelay,
                maxUpdateDelay
            );
            await liquidityAccumulator.deployed();

            const mathUtilFactory = await ethers.getContractFactory("MathUtil");
            mathUtil = await mathUtilFactory.deploy();
            await mathUtil.deployed();

            await liquidityAccumulator.overrideValidateObservation(true, true);

            startingTime = BigNumber.from(0);
        });

        async function verifyUpdate(
            expectedReturn,
            initialLiquidity,
            secondLiquidity = undefined,
            firstUpdateTime = 0,
            initialCumulativeLiquidity = undefined
        ) {
            expect(await liquidityAccumulator.callStatic.update(ethers.utils.hexZeroPad(GRT, 32))).to.equal(
                expectedReturn
            );

            const receipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));
            await receipt.wait();

            const updateTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

            const accumulation = await liquidityAccumulator.getLastAccumulation(GRT);
            const observation = await liquidityAccumulator.observations(GRT);

            var expectedCumulativeTokenLiquidity = 0;
            var expectedCumulativeQuoteTokenLiquidity = 0;

            var expectedTokenLiquidity = 0;
            var expectedQuoteTokenLiquidity = 0;

            var expectedTimestamp = startingTime;

            if (secondLiquidity) {
                // Verifying a second update

                if (expectedReturn) {
                    // An update should have occurred

                    // Increase time so that delta time from the last accumulation to the current is not 0
                    await hre.timeAndMine.setTime((await currentBlockTimestamp()) + 10);

                    const liquidityFromAccumulation = await liquidityAccumulator.calculateLiquidity(
                        await liquidityAccumulator.getLastAccumulation(GRT),
                        await liquidityAccumulator.getCurrentAccumulation(GRT)
                    );

                    const deltaTime = updateTime - firstUpdateTime;

                    expectedCumulativeTokenLiquidity = initialCumulativeLiquidity.token.add(
                        await calculateTimeWeightedValue(
                            mathUtil,
                            BigNumber.from(initialLiquidity["token"]),
                            BigNumber.from(deltaTime)
                        )
                    );
                    expectedCumulativeQuoteTokenLiquidity = initialCumulativeLiquidity.quoteToken.add(
                        await calculateTimeWeightedValue(
                            mathUtil,
                            BigNumber.from(initialLiquidity["quoteToken"]),
                            BigNumber.from(deltaTime)
                        )
                    );

                    // Process overflows
                    while (expectedCumulativeTokenLiquidity.gt(MAX_CUMULATIVE_VALUE)) {
                        expectedCumulativeTokenLiquidity = expectedCumulativeTokenLiquidity.sub(
                            MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                        );
                    }
                    while (expectedCumulativeQuoteTokenLiquidity.gt(MAX_CUMULATIVE_VALUE)) {
                        expectedCumulativeQuoteTokenLiquidity = expectedCumulativeQuoteTokenLiquidity.sub(
                            MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                        );
                    }

                    expectedTokenLiquidity = secondLiquidity["token"];
                    expectedQuoteTokenLiquidity = secondLiquidity["quoteToken"];

                    expectedTimestamp = updateTime;

                    // Verify liquidity from accumulations is correct
                    if (expectedTokenLiquidity.eq(0)) {
                        // 1 is sometimes used as a zero liquidity to avoid math errors
                        expect(liquidityFromAccumulation["tokenLiquidity"], "LFA - TL").to.be.within(0, 1);
                    } else {
                        // Allow 0.001% error
                        expect(liquidityFromAccumulation["tokenLiquidity"], "LFA - TL").to.be.closeTo(
                            expectedTokenLiquidity,
                            expectedTokenLiquidity.div(100000)
                        );
                    }
                    if (expectedQuoteTokenLiquidity.eq(0)) {
                        // 1 is sometimes used as a zero liquidity to avoid math errors
                        expect(liquidityFromAccumulation["quoteTokenLiquidity"], "LFA - QTL").to.be.within(0, 1);
                    } else {
                        // Allow 0.001% error
                        expect(liquidityFromAccumulation["quoteTokenLiquidity"], "LFA - QTL").to.be.closeTo(
                            expectedQuoteTokenLiquidity,
                            expectedQuoteTokenLiquidity.div(100000)
                        );
                    }

                    await expect(receipt, "2L - Log")
                        .to.emit(liquidityAccumulator, "Updated")
                        .withArgs(GRT, expectedTokenLiquidity, expectedQuoteTokenLiquidity, updateTime);
                } else {
                    // No update should have occurred => use last values

                    expectedCumulativeTokenLiquidity = initialLiquidity["token"] ?? 0;
                    expectedCumulativeQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                    expectedTokenLiquidity = initialLiquidity["token"] ?? 0;
                    expectedQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                    expectedTimestamp = firstUpdateTime;

                    await expect(receipt, "2L - NLog").to.not.emit(liquidityAccumulator, "Updated");
                }
            } else {
                // Verifying initial update

                if (expectedReturn) {
                    // An update should have occurred

                    const deltaTime = updateTime - firstUpdateTime;

                    expectedCumulativeTokenLiquidity = initialCumulativeLiquidity["token"].add(
                        await calculateTimeWeightedValue(mathUtil, BigNumber.from(0), BigNumber.from(deltaTime))
                    );
                    expectedCumulativeQuoteTokenLiquidity = initialCumulativeLiquidity["quoteToken"].add(
                        await calculateTimeWeightedValue(mathUtil, BigNumber.from(0), BigNumber.from(deltaTime))
                    );

                    expectedTokenLiquidity = initialLiquidity["token"] ?? 0;
                    expectedQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                    expectedTimestamp = updateTime;

                    await expect(receipt, "1L - Log")
                        .to.emit(liquidityAccumulator, "Updated")
                        .withArgs(GRT, expectedTokenLiquidity, expectedQuoteTokenLiquidity, updateTime);
                } else {
                    // An update should not have occurred

                    // Verify that the cumulative liquidity doesn't change
                    expectedCumulativeTokenLiquidity = initialCumulativeLiquidity["token"];
                    expectedCumulativeQuoteTokenLiquidity = initialCumulativeLiquidity["quoteToken"];

                    await expect(receipt, "1L - NLog").to.not.emit(liquidityAccumulator, "Updated");
                }
            }

            // Allow 0.001% error
            expect(accumulation["cumulativeTokenLiquidity"], "CTL").to.be.closeTo(
                expectedCumulativeTokenLiquidity,
                expectedCumulativeTokenLiquidity.div(100000)
            );

            // Allow 0.001% error
            expect(accumulation["cumulativeQuoteTokenLiquidity"], "CQTL").to.be.closeTo(
                expectedCumulativeQuoteTokenLiquidity,
                expectedCumulativeQuoteTokenLiquidity.div(100000)
            );

            expect(accumulation["timestamp"], "AT").to.equal(expectedTimestamp);

            expect(observation["tokenLiquidity"], "TL").to.equal(expectedTokenLiquidity);
            expect(observation["quoteTokenLiquidity"], "QTL").to.equal(expectedQuoteTokenLiquidity);
            expect(observation["timestamp"], "OT").to.equal(expectedTimestamp);

            // Now we make the liquidity accumulator catch up and verify the latest accumulations

            // No changes expected => return
            if (!expectedReturn || !initialLiquidity) return;

            // Ensure enough time passes to warrent an update
            await hre.timeAndMine.setTime((await currentBlockTimestamp()) + maxUpdateDelay);

            const receipt2 = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));
            await receipt2.wait();

            const updateTime2 = (await ethers.provider.getBlock(receipt2.blockNumber)).timestamp;

            const accumulation2 = await liquidityAccumulator.getLastAccumulation(GRT);
            const observation2 = await liquidityAccumulator.observations(GRT);

            const deltaTime2 = updateTime2 - updateTime;

            if (secondLiquidity) {
                expectedCumulativeTokenLiquidity = BigNumber.from(expectedCumulativeTokenLiquidity).add(
                    await calculateTimeWeightedValue(
                        mathUtil,
                        BigNumber.from(secondLiquidity["token"]),
                        BigNumber.from(deltaTime2)
                    )
                );
                expectedCumulativeQuoteTokenLiquidity = BigNumber.from(expectedCumulativeQuoteTokenLiquidity).add(
                    await calculateTimeWeightedValue(
                        mathUtil,
                        BigNumber.from(secondLiquidity["quoteToken"]),
                        BigNumber.from(deltaTime2)
                    )
                );
            } else {
                expectedCumulativeTokenLiquidity = BigNumber.from(expectedCumulativeTokenLiquidity).add(
                    await calculateTimeWeightedValue(
                        mathUtil,
                        BigNumber.from(initialLiquidity["token"]),
                        BigNumber.from(deltaTime2)
                    )
                );
                expectedCumulativeQuoteTokenLiquidity = BigNumber.from(expectedCumulativeQuoteTokenLiquidity).add(
                    await calculateTimeWeightedValue(
                        mathUtil,
                        BigNumber.from(initialLiquidity["quoteToken"]),
                        BigNumber.from(deltaTime2)
                    )
                );
            }

            // Process overflows
            while (expectedCumulativeTokenLiquidity.gt(MAX_CUMULATIVE_VALUE)) {
                expectedCumulativeTokenLiquidity = expectedCumulativeTokenLiquidity.sub(
                    MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                );
            }
            while (expectedCumulativeQuoteTokenLiquidity.gt(MAX_CUMULATIVE_VALUE)) {
                expectedCumulativeQuoteTokenLiquidity = expectedCumulativeQuoteTokenLiquidity.sub(
                    MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                );
            }

            // Allow 0.001% error
            expect(accumulation2["cumulativeTokenLiquidity"], "Final CTL").to.be.closeTo(
                expectedCumulativeTokenLiquidity,
                expectedCumulativeTokenLiquidity.div(100000)
            );

            // Allow 0.001% error
            expect(accumulation2["cumulativeQuoteTokenLiquidity"], "Final CQTL").to.be.closeTo(
                expectedCumulativeQuoteTokenLiquidity,
                expectedCumulativeQuoteTokenLiquidity.div(100000)
            );

            expect(accumulation2["timestamp"], "Final AT").to.equal(updateTime2);

            expect(observation2["tokenLiquidity"], "Final TL").to.equal(expectedTokenLiquidity);
            expect(observation2["quoteTokenLiquidity"], "Final QTL").to.equal(expectedQuoteTokenLiquidity);
            expect(observation2["timestamp"], "Final OT").to.equal(updateTime2);
        }

        initialUpdateTests.forEach(({ args, expectedReturn }) => {
            it(`${expectedReturn ? "Should" : "Shouldn't"} update (initial) using args ${JSON.stringify(
                args
            )}`, async function () {
                // Initialize the first observation and accumulation with zero liquidities
                {
                    await liquidityAccumulator.overrideNeedsUpdate(true, true);
                    await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) observation
                    await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) accumulation
                    [, , startingTime] = await liquidityAccumulator.getLastAccumulation(GRT);
                    await liquidityAccumulator.overrideNeedsUpdate(false, false);
                    await hre.timeAndMine.setTime((await currentBlockTimestamp()) + maxUpdateDelay);
                }

                const lastAccumulation = await liquidityAccumulator.getLastAccumulation(GRT);
                const initialCumulativeLiquidity = {
                    token: lastAccumulation["cumulativeTokenLiquidity"],
                    quoteToken: lastAccumulation["cumulativeQuoteTokenLiquidity"],
                };

                if (args["initialLiquidity"]) {
                    // Configure liquidity
                    await (
                        await liquidityAccumulator.setLiquidity(
                            GRT,
                            args["initialLiquidity"]["token"],
                            args["initialLiquidity"]["quoteToken"]
                        )
                    ).wait();
                }

                if (args["overrideNeedsUpdate"]) {
                    // Override needsUpdate
                    await (
                        await liquidityAccumulator.overrideNeedsUpdate(true, args["overrideNeedsUpdate"]["needsUpdate"])
                    ).wait();
                }

                await verifyUpdate(
                    expectedReturn,
                    args["initialLiquidity"],
                    undefined,
                    startingTime,
                    initialCumulativeLiquidity
                );
            });
        });

        secondUpdateTests.forEach(({ args, expectedReturn }) => {
            it(`${expectedReturn ? "Should" : "Shouldn't"} update using args ${JSON.stringify(
                args
            )}`, async function () {
                // Initialize the first observation and accumulation with zero liquidities
                {
                    await liquidityAccumulator.overrideNeedsUpdate(true, true);
                    await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) observation
                    await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) accumulation
                    [, , startingTime] = await liquidityAccumulator.getLastAccumulation(GRT);
                    await liquidityAccumulator.overrideNeedsUpdate(false, false);
                    await hre.timeAndMine.setTime((await currentBlockTimestamp()) + maxUpdateDelay);
                }

                // Configure initial liquidity
                await (
                    await liquidityAccumulator.setLiquidity(
                        GRT,
                        args["initialLiquidity"]["token"],
                        args["initialLiquidity"]["quoteToken"]
                    )
                ).wait();

                // Initial update
                const receipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));
                await receipt.wait();

                const updateTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

                // Override cumulativePrice
                if (args["initialCumulativeLiquidity"]) {
                    await (
                        await liquidityAccumulator.stubSetAccumulation(
                            GRT,
                            args["initialCumulativeLiquidity"]["token"],
                            args["initialCumulativeLiquidity"]["quoteToken"],
                            updateTime
                        )
                    ).wait();
                }

                const lastAccumulation = await liquidityAccumulator.getLastAccumulation(GRT);
                const initialCumulativeLiquidity = {
                    token: lastAccumulation["cumulativeTokenLiquidity"],
                    quoteToken: lastAccumulation["cumulativeQuoteTokenLiquidity"],
                };

                // Configure liquidity
                await (
                    await liquidityAccumulator.setLiquidity(
                        GRT,
                        args["secondLiquidity"]["token"],
                        args["secondLiquidity"]["quoteToken"]
                    )
                ).wait();

                if (args["overrideNeedsUpdate"]) {
                    // Override needsUpdate
                    await (
                        await liquidityAccumulator.overrideNeedsUpdate(true, args["overrideNeedsUpdate"]["needsUpdate"])
                    ).wait();
                }

                await verifyUpdate(
                    expectedReturn,
                    args["initialLiquidity"],
                    args["secondLiquidity"],
                    updateTime,
                    args["initialCumulativeLiquidity"] ?? initialCumulativeLiquidity
                );
            });
        });

        it("Shouldn't update when deltaTime = 0", async () => {
            // Configure initial liquidity
            const initialTokenLiquidity = ethers.utils.parseEther("100");
            const initialQuoteTokenLiquidity = ethers.utils.parseEther("100");
            await (
                await liquidityAccumulator.setLiquidity(GRT, initialTokenLiquidity, initialQuoteTokenLiquidity)
            ).wait();

            // Override needsUpdate
            await (await liquidityAccumulator.overrideNeedsUpdate(true, true)).wait();

            // Initial update
            const initialUpdateReceipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));
            await initialUpdateReceipt.wait();
            const initialUpdateTime = (await ethers.provider.getBlock(initialUpdateReceipt.blockNumber)).timestamp;

            // Configure liquidity(1)
            const firstTokenLiquidity = ethers.utils.parseEther("101");
            const firstQuoteTokenLiquidity = ethers.utils.parseEther("101");
            await (await liquidityAccumulator.setLiquidity(GRT, firstTokenLiquidity, firstQuoteTokenLiquidity)).wait();

            // Disable automining
            await ethers.provider.send("evm_setAutomine", [false]);

            try {
                // Perform update(1)
                const firstUpdateReceipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));

                // Configure liquidity(2)
                const updateLiquidityReceipt = await liquidityAccumulator.setLiquidity(
                    GRT,
                    ethers.utils.parseEther("102"),
                    ethers.utils.parseEther("102")
                );

                // Perform update(2)
                const secondUpdateReceipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));

                // Mine the transactions
                await ethers.provider.send("evm_mine");

                // Wait for transactions to be mined
                await firstUpdateReceipt.wait();
                await updateLiquidityReceipt.wait();
                await secondUpdateReceipt.wait();

                const firstUpdateTime = (await ethers.provider.getBlock(firstUpdateReceipt.blockNumber)).timestamp;

                const deltaTime = firstUpdateTime - initialUpdateTime;

                const expectedCumulativeTokenLiquidity = await calculateTimeWeightedValue(
                    mathUtil,
                    BigNumber.from(initialTokenLiquidity),
                    BigNumber.from(deltaTime)
                );
                const expectedCumulativeQuoteTokenLiquidity = await calculateTimeWeightedValue(
                    mathUtil,
                    BigNumber.from(initialQuoteTokenLiquidity),
                    BigNumber.from(deltaTime)
                );

                const accumulation = await liquidityAccumulator.getLastAccumulation(GRT);
                const observation = await liquidityAccumulator.observations(GRT);

                // Allow 0.001% error
                expect(accumulation["cumulativeTokenLiquidity"], "CTL").to.be.closeTo(
                    expectedCumulativeTokenLiquidity,
                    expectedCumulativeTokenLiquidity.div(100000)
                );

                // Allow 0.001% error
                expect(accumulation["cumulativeQuoteTokenLiquidity"], "CQTL").to.be.closeTo(
                    expectedCumulativeQuoteTokenLiquidity,
                    expectedCumulativeQuoteTokenLiquidity.div(100000)
                );

                expect(observation["tokenLiquidity"], "TL").to.equal(firstTokenLiquidity);
                expect(observation["quoteTokenLiquidity"], "QTL").to.equal(firstQuoteTokenLiquidity);
            } finally {
                // Re-enable automining
                await ethers.provider.send("evm_setAutomine", [true]);
            }
        });

        it("Shouldn't update when validateObservation returns false", async () => {
            // Configure initial liquidity
            const initialTokenLiquidity = ethers.utils.parseEther("100");
            const initialQuoteTokenLiquidity = ethers.utils.parseEther("100");
            await (
                await liquidityAccumulator.setLiquidity(GRT, initialTokenLiquidity, initialQuoteTokenLiquidity)
            ).wait();

            // Override needsUpdate
            await (await liquidityAccumulator.overrideNeedsUpdate(true, true)).wait();

            // Initial update
            const initialUpdateReceipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));
            await initialUpdateReceipt.wait();
            const initialUpdateTime = (await ethers.provider.getBlock(initialUpdateReceipt.blockNumber)).timestamp;

            // Configure liquidity(1)
            const firstTokenLiquidity = ethers.utils.parseEther("200");
            const firstQuoteTokenLiquidity = ethers.utils.parseEther("200");
            await (await liquidityAccumulator.setLiquidity(GRT, firstTokenLiquidity, firstQuoteTokenLiquidity)).wait();

            // Make validateObservation return false
            await liquidityAccumulator.overrideValidateObservation(true, false);

            // Perform update(1)
            const firstUpdateReceipt = await liquidityAccumulator.update(ethers.utils.hexZeroPad(GRT, 32));

            await expect(firstUpdateReceipt).to.not.emit(liquidityAccumulator, "Updated");

            const accumulation = await liquidityAccumulator.getLastAccumulation(GRT);
            const observation = await liquidityAccumulator.observations(GRT);

            expect(accumulation["cumulativeTokenLiquidity"]).to.equal(0);
            expect(accumulation["cumulativeQuoteTokenLiquidity"]).to.equal(0);

            expect(observation["tokenLiquidity"]).to.equal(initialTokenLiquidity);
            expect(observation["quoteTokenLiquidity"]).to.equal(initialQuoteTokenLiquidity);
            expect(observation["timestamp"]).to.equal(initialUpdateTime);
        });
    });

    describe(contractName + "#supportsInterface(interfaceId)", function () {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var liquidityAccumulator;
        var interfaceIds;

        beforeEach(async () => {
            const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
            const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
            liquidityAccumulator = await LiquidityAccumulator.deploy(
                USDC,
                TWO_PERCENT_CHANGE,
                minUpdateDelay,
                maxUpdateDelay
            );
            await liquidityAccumulator.deployed();
            interfaceIds = await interfaceIdsFactory.deploy();
        });

        it("Should support ILiquidityAccumulator", async () => {
            const interfaceId = await interfaceIds.iLiquidityAccumulator();
            expect(await liquidityAccumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });

        it("Should support ILiquidityOracle", async () => {
            const interfaceId = await interfaceIds.iLiquidityOracle();
            expect(await liquidityAccumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });

        it("Should support IQuoteToken", async () => {
            const interfaceId = await interfaceIds.iQuoteToken();
            expect(await liquidityAccumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });

        it("Should support IUpdateable", async () => {
            const interfaceId = await interfaceIds.iUpdateable();
            expect(await liquidityAccumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });

        it("Should support IAccumulator", async () => {
            const interfaceId = await interfaceIds.iAccumulator();
            expect(await liquidityAccumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });
    });

    describe(contractName + "#consultLiquidity(token)", function () {
        var oracle;

        const tests = [
            {
                args: {
                    tokenLiquidity: BigNumber.from(1),
                    quoteTokenLiquidity: BigNumber.from(1),
                },
            },
            {
                args: {
                    tokenLiquidity: BigNumber.from(1),
                    quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
                },
            },
            {
                args: {
                    tokenLiquidity: BigNumber.from("1000000000000000000"),
                    quoteTokenLiquidity: BigNumber.from(1),
                },
            },
            {
                args: {
                    tokenLiquidity: BigNumber.from("1000000000000000000"),
                    quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
                },
            },
        ];

        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        beforeEach(async () => {
            const accumulatorFactory = await ethers.getContractFactory(stubContractName);
            oracle = await accumulatorFactory.deploy(USDC, TWO_PERCENT_CHANGE, minUpdateDelay, maxUpdateDelay);

            // Time increases by 1 second with each block mined
            await hre.timeAndMine.setTimeIncrease(1);
        });

        it("Should revert when there's no observation", async () => {
            await expect(oracle["consultLiquidity(address)"](AddressZero)).to.be.revertedWith(
                "LiquidityAccumulator: MISSING_OBSERVATION"
            );
        });

        it("Should return fixed values when token == quoteToken", async function () {
            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](
                await oracle.quoteTokenAddress()
            );

            expect(tokenLiqudity).to.equal(0);
            expect(quoteTokenLiquidity).to.equal(0);
        });

        tests.forEach(({ args }) => {
            it(`Should get the set token liquidity (=${args["tokenLiquidity"]}) and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
                const _tokenLiqudity = args["tokenLiquidity"];
                const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

                const observationTime = await currentBlockTimestamp();

                await oracle.stubSetObservation(AddressZero, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

                const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](AddressZero);

                expect(tokenLiqudity).to.equal(_tokenLiqudity);
                expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
            });
        });
    });

    describe(contractName + "#consultLiquidity(token, maxAge = 0)", function () {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var accumulator;

        beforeEach(async () => {
            const accumulatorFactory = await ethers.getContractFactory(stubContractName);
            accumulator = await accumulatorFactory.deploy(USDC, TWO_PERCENT_CHANGE, minUpdateDelay, maxUpdateDelay);
        });

        tests = [0, 1, ethers.utils.parseUnits("1.0", 18), BigNumber.from(2).pow(112).sub(1)];

        tests.forEach(function (tokenLiquidity) {
            tests.forEach(function (quoteTokenLiquidity) {
                it(`tokenLiquidity = ${tokenLiquidity} and quoteTokenLiquidity = ${quoteTokenLiquidity}`, async function () {
                    await accumulator.setLiquidity(ethers.constants.AddressZero, tokenLiquidity, quoteTokenLiquidity);

                    const result = await accumulator["consultLiquidity(address,uint256)"](
                        ethers.constants.AddressZero,
                        0
                    );

                    expect(result["tokenLiquidity"], "Token liquidity").to.equal(tokenLiquidity);
                    expect(result["quoteTokenLiquidity"], "Quote token liquidity").to.equal(quoteTokenLiquidity);
                });
            });
        });
    });

    describe(contractName + "#consultLiquidity(token, maxAge = 60)", function () {
        const MAX_AGE = 60;

        var oracle;

        const tests = [
            {
                args: {
                    tokenLiquidity: BigNumber.from(1),
                    quoteTokenLiquidity: BigNumber.from(1),
                },
            },
            {
                args: {
                    tokenLiquidity: BigNumber.from(1),
                    quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
                },
            },
            {
                args: {
                    tokenLiquidity: BigNumber.from("1000000000000000000"),
                    quoteTokenLiquidity: BigNumber.from(1),
                },
            },
            {
                args: {
                    tokenLiquidity: BigNumber.from("1000000000000000000"),
                    quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
                },
            },
        ];

        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        beforeEach(async () => {
            const accumulatorFactory = await ethers.getContractFactory(stubContractName);
            oracle = await accumulatorFactory.deploy(USDC, TWO_PERCENT_CHANGE, minUpdateDelay, maxUpdateDelay);

            // Time increases by 1 second with each block mined
            await hre.timeAndMine.setTimeIncrease(1);
        });

        it("Should revert when there's no observation", async () => {
            await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
                "LiquidityAccumulator: MISSING_OBSERVATION"
            );
        });

        it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(AddressZero, 1, 1, observationTime);

            const time = observationTime + MAX_AGE + 1;

            await hre.timeAndMine.setTime(time);

            expect(await currentBlockTimestamp()).to.equal(time);
            await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
                "LiquidityAccumulator: RATE_TOO_OLD"
            );
        });

        it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(AddressZero, 1, 1, observationTime);

            const time = observationTime + MAX_AGE;

            await hre.timeAndMine.setTime(time);

            expect(await currentBlockTimestamp()).to.equal(time);
            await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
        });

        it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(AddressZero, 1, 1, observationTime);

            const time = observationTime + MAX_AGE - 1;

            await hre.timeAndMine.setTime(time);

            expect(await currentBlockTimestamp()).to.equal(time);
            await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
        });

        it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
            const observationTime = (await currentBlockTimestamp()) + 10;

            await oracle.stubSetObservation(AddressZero, 1, 1, observationTime);

            const time = observationTime;

            await hre.timeAndMine.setTime(time);

            expect(await currentBlockTimestamp()).to.equal(time);
            await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
        });

        it("Should return fixed values when token == quoteToken", async function () {
            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
                await oracle.quoteTokenAddress(),
                MAX_AGE
            );

            expect(tokenLiqudity).to.equal(0);
            expect(quoteTokenLiquidity).to.equal(0);
        });

        tests.forEach(({ args }) => {
            it(`Should get the set token liquidity (=${args["tokenLiquidity"]}) and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
                const _tokenLiqudity = args["tokenLiquidity"];
                const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

                const observationTime = await currentBlockTimestamp();

                await oracle.stubSetObservation(AddressZero, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

                const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
                    AddressZero,
                    MAX_AGE
                );

                expect(tokenLiqudity).to.equal(_tokenLiqudity);
                expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
            });
        });
    });

    describe(contractName + "#validateObservation(token, tokenLiquidity, quoteTokenLiquidity)", function () {
        const minUpdateDelay = 10000;
        const maxUpdateDelay = 30000;

        var accumulator;
        var accumulatorCaller;
        var token;

        beforeEach(async () => {
            const accumulatorFactory = await ethers.getContractFactory(stubContractName);
            const accumulatorCallerFactory = await ethers.getContractFactory(stubCallerContractName);
            const erc20Factory = await ethers.getContractFactory("FakeERC20");

            accumulator = await accumulatorFactory.deploy(USDC, TWO_PERCENT_CHANGE, minUpdateDelay, maxUpdateDelay);
            await accumulator.deployed();

            accumulatorCaller = await accumulatorCallerFactory.deploy(accumulator.address);

            token = await erc20Factory.deploy("Token", "T", 18);
            await token.deployed();
        });

        it("Should revert when caller is a smart contract", async () => {
            await expect(accumulatorCaller.stubValidateObservation(token.address, 0, 0)).to.be.revertedWith(
                "LiquidityAccumulator: MUST_BE_EOA"
            );
        });

        describe("Caller is not a smart contract", function () {
            it("Should return true when provided liquidity levels match the observed levels", async function () {
                // "observed"
                const oTokenLiquidity = ethers.utils.parseUnits("1.0", 18);
                const oQuoteTokenLiquidity = ethers.utils.parseUnits("1.0", 18);

                // provided externally
                const pTokenLiquidity = oTokenLiquidity;
                const pQuoteTokenLiquidity = oQuoteTokenLiquidity;

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token.address, pTokenLiquidity, pQuoteTokenLiquidity]
                );

                expect(
                    await accumulator.callStatic.stubValidateObservation(
                        updateData,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity
                    )
                ).to.equal(true);

                const tx = await accumulator.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity);
                const receipt = await tx.wait();
                const timestamp = await blockTimestamp(receipt.blockNumber);

                await expect(tx)
                    .to.emit(accumulator, "ValidationPerformed")
                    .withArgs(
                        token.address,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity,
                        pTokenLiquidity,
                        pQuoteTokenLiquidity,
                        timestamp,
                        true
                    );
            });

            it("Should return false when the observed token liquidity is too different from the provided value", async function () {
                // "observed"
                const oTokenLiquidity = ethers.utils.parseUnits("1.0", 18);
                const oQuoteTokenLiquidity = ethers.utils.parseUnits("1.0", 18);

                // provided externally
                const pTokenLiquidity = oTokenLiquidity.mul(2);
                const pQuoteTokenLiquidity = oQuoteTokenLiquidity;

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token.address, pTokenLiquidity, pQuoteTokenLiquidity]
                );

                expect(
                    await accumulator.callStatic.stubValidateObservation(
                        updateData,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity
                    )
                ).to.equal(false);

                const tx = await accumulator.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity);
                const receipt = await tx.wait();
                const timestamp = await blockTimestamp(receipt.blockNumber);

                await expect(tx)
                    .to.emit(accumulator, "ValidationPerformed")
                    .withArgs(
                        token.address,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity,
                        pTokenLiquidity,
                        pQuoteTokenLiquidity,
                        timestamp,
                        false
                    );
            });

            it("Should return false when the observed quote token liquidity is too different from the provided value", async function () {
                // "observed"
                const oTokenLiquidity = ethers.utils.parseUnits("1.0", 18);
                const oQuoteTokenLiquidity = ethers.utils.parseUnits("1.0", 18);

                // provided externally
                const pTokenLiquidity = oTokenLiquidity;
                const pQuoteTokenLiquidity = oQuoteTokenLiquidity.mul(2);

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token.address, pTokenLiquidity, pQuoteTokenLiquidity]
                );

                expect(
                    await accumulator.callStatic.stubValidateObservation(
                        updateData,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity
                    )
                ).to.equal(false);

                const tx = await accumulator.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity);
                const receipt = await tx.wait();
                const timestamp = await blockTimestamp(receipt.blockNumber);

                await expect(tx)
                    .to.emit(accumulator, "ValidationPerformed")
                    .withArgs(
                        token.address,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity,
                        pTokenLiquidity,
                        pQuoteTokenLiquidity,
                        timestamp,
                        false
                    );
            });

            it("Should return false when the observed liquidity levels are too different from the provided values", async function () {
                // "observed"
                const oTokenLiquidity = ethers.utils.parseUnits("1.0", 18);
                const oQuoteTokenLiquidity = ethers.utils.parseUnits("1.0", 18);

                // provided externally
                const pTokenLiquidity = oTokenLiquidity.mul(2);
                const pQuoteTokenLiquidity = oQuoteTokenLiquidity.mul(2);

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token.address, pTokenLiquidity, pQuoteTokenLiquidity]
                );

                expect(
                    await accumulator.callStatic.stubValidateObservation(
                        updateData,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity
                    )
                ).to.equal(false);

                const tx = await accumulator.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity);
                const receipt = await tx.wait();
                const timestamp = await blockTimestamp(receipt.blockNumber);

                await expect(tx)
                    .to.emit(accumulator, "ValidationPerformed")
                    .withArgs(
                        token.address,
                        oTokenLiquidity,
                        oQuoteTokenLiquidity,
                        pTokenLiquidity,
                        pQuoteTokenLiquidity,
                        timestamp,
                        false
                    );
            });
        });
    });
}

describeLiquidityAccumulatorTests(
    "LiquidityAccumulator",
    "LiquidityAccumulatorStub",
    "LiquidityAccumulatorStubCaller",
    async (mathUtil, value, time) => {
        return value.mul(time);
    }
);

describeLiquidityAccumulatorTests(
    "GeometricLiquidityAccumulator",
    "GeometricLiquidityAccumulatorStub",
    "GeometricLiquidityAccumulatorStubCaller",
    async (mathUtil, value, time) => {
        if (value.eq(0)) {
            // ln(0) is undefined
            value = BigNumber.from(1);
        }

        return ln(toBn(value.toString())).mul(time);
    }
);

describeLiquidityAccumulatorTests(
    "HarmonicLiquidityAccumulator",
    "HarmonicLiquidityAccumulatorStub",
    "HarmonicLiquidityAccumulatorStubCaller",
    async (mathUtil, value, time) => {
        if (value.eq(0)) {
            // division by zero is undefined
            value = BigNumber.from(1);
        }

        time = await mathUtil.shl(time, 80); // shift time to the left by 80 bits

        return time.div(value);
    }
);
