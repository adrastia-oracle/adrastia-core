const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ln } = require("@prb/math");
const { fromBn, toBn } = require("evm-bn");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

const MAX_CUMULATIVE_VALUE = BigNumber.from(2).pow(224).sub(1);
const MAX_PRICE = BigNumber.from(2).pow(112).sub(1);

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function describePriceAccumulatorTests(
    contractName,
    stubContractName,
    stubCallerContractName,
    averagingStrategyName,
    calculateTimeWeightedPrice
) {
    describe(contractName + " using " + averagingStrategyName, function () {
        var averagingStrategy;

        beforeEach(async function () {
            const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
            averagingStrategy = await averagingStrategyFactory.deploy();
            await averagingStrategy.deployed();
        });

        describe(contractName + "#fetchPrice", function () {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();

                // Configure price
                await accumulator.setPrice(GRT, 100);

                // Override changeThresholdPassed (true)
                await accumulator.overrideChangeThresholdPassed(true, true);
            });

            const tests = [[0], [1], [10], [ethers.utils.parseUnits("101.0", 18)]];

            for (const test of tests) {
                it(`price = ${test[0].toString()}`, async function () {
                    // Configure price
                    await accumulator.setPrice(GRT, test[0]);

                    const price = await accumulator.stubFetchPrice(GRT);

                    expect(price).to.equal(test[0]);
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
                        averagingStrategy.address,
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

            var accumulator;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();
            });

            it("Reverts if the last observation is uninitialized", async function () {
                await expect(accumulator.getCurrentAccumulation(GRT)).to.be.revertedWith(
                    "PriceAccumulator: UNINITIALIZED"
                );
            });
        });

        describe(contractName + "#needsUpdate", () => {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;

            var updateTime;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();

                // Configure price
                await accumulator.setPrice(GRT, 100);

                // Override changeThresholdPassed (false)
                await accumulator.overrideChangeThresholdPassed(true, false);

                // Override validateObservation
                await accumulator.overrideValidateObservation(true, true);

                // Time increases by 1 second with each block mined
                await hre.timeAndMine.setTimeIncrease(1);

                // Initial update
                const updateReceipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));
                updateTime = (await ethers.provider.getBlock(updateReceipt.blockNumber)).timestamp;
            });

            it("Shouldn't need update if delta time is less than the min update delay (update threshold passed)", async () => {
                // changeThresholdPassed = true
                await accumulator.overrideChangeThresholdPassed(true, true);

                // deltaTime = 1
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

                // deltaTime = minUpdateDelay - 1
                await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
            });

            it("Shouldn't need update if delta time is less than the min update delay (update threshold not passed)", async () => {
                // deltaTime = 1
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

                // deltaTime = minUpdateDelay - 1
                await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
            });

            it("Should need update if delta time is within min and max update delay (update threshold passed)", async () => {
                // changeThresholdPassed = true
                await accumulator.overrideChangeThresholdPassed(true, true);

                // deltaTime = minUpdateDelay
                await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

                // deltaTime = maxUpdateDelay - 1
                await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
            });

            it("Shouldn't need update if delta time is within min and max update delay (update threshold not passed)", async () => {
                // deltaTime = minUpdateDelay
                await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

                // deltaTime = maxUpdateDelay - 1
                await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
            });

            it("Should need update if delta time is >= max update delay (update threshold passed)", async () => {
                // changeThresholdPassed = true
                await accumulator.overrideChangeThresholdPassed(true, true);

                // deltaTime = maxUpdateDelay
                await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

                // deltaTime = maxUpdateDelay + 1
                await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
            });

            it("Should need update if delta time is >= max update delay (update threshold not passed)", async () => {
                // deltaTime = maxUpdateDelay
                await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

                // deltaTime = maxUpdateDelay + 1
                await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
                expect(await accumulator.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
            });
        });

        describe(contractName + "#canUpdate", () => {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
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

            var accumulator;

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
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();
            });

            tests.forEach(({ args, expected }) => {
                it(`Should evaluate to ${expected} with prices {${args[0]}, ${args[1]}} and update threshold ${args[2]}`, async () => {
                    const received = await accumulator.harnessChangeThresholdSurpassed(args[0], args[1], args[2]);
                    expect(received).to.equal(expected);
                });
            });
        });

        describe(contractName + "#calculatePrice", () => {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;
            var mathUtil;

            const tests = [
                {
                    firstAccumulation: { cumulativePrice: 0, timestamp: 1 },
                    deltaTime: 1,
                    price: ethers.utils.parseUnits("1.0", 18),
                },
                {
                    firstAccumulation: { cumulativePrice: 0, timestamp: 1 },
                    deltaTime: 1,
                    price: BigNumber.from(0),
                },
                {
                    firstAccumulation: { cumulativePrice: 1000000, timestamp: 1 },
                    deltaTime: 1,
                    price: BigNumber.from(0),
                },
                {
                    firstAccumulation: { cumulativePrice: 1000000, timestamp: 1 },
                    deltaTime: 1,
                    price: ethers.utils.parseUnits("1000000.0", 18),
                },
                {
                    firstAccumulation: { cumulativePrice: 1000000, timestamp: 1 },
                    deltaTime: 10,
                    price: ethers.utils.parseUnits("100000.0", 18),
                },
                {
                    firstAccumulation: { cumulativePrice: 1000000, timestamp: 100000 },
                    deltaTime: 100000,
                    price: ethers.utils.parseUnits("10.0", 18),
                },
                {
                    // **Overflow test**
                    firstAccumulation: {
                        cumulativePrice: MAX_CUMULATIVE_VALUE,
                        timestamp: 10,
                    },
                    deltaTime: 1,
                    price: ethers.utils.parseUnits("10.0", 18),
                },
            ];

            const revertedWithTests = [
                {
                    args: [
                        { cumulativePrice: 0, timestamp: 0 },
                        { cumulativePrice: 0, timestamp: 0 },
                    ],
                    expected: "PriceAccumulator: TIMESTAMP_CANNOT_BE_ZERO",
                },
                {
                    args: [
                        { cumulativePrice: 0, timestamp: 0 },
                        { cumulativePrice: 0, timestamp: 1 },
                    ],
                    expected: "PriceAccumulator: TIMESTAMP_CANNOT_BE_ZERO",
                },
                {
                    args: [
                        { cumulativePrice: 0, timestamp: 1 },
                        { cumulativePrice: 0, timestamp: 1 },
                    ],
                    expected: "PriceAccumulator: DELTA_TIME_CANNOT_BE_ZERO",
                },
                {
                    args: [
                        { cumulativePrice: 0, timestamp: 1 },
                        { cumulativePrice: 0, timestamp: 0 },
                    ],
                    expected: false, // Subtraction underflow
                },
            ];

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();

                const mathUtilFactory = await ethers.getContractFactory("MathUtil");
                mathUtil = await mathUtilFactory.deploy();
                await mathUtil.deployed();
            });

            tests.forEach(({ firstAccumulation, deltaTime, price }) => {
                it(`Should evaluate to ${
                    price.toString() + (price.eq(0) ? " or 1" : "")
                } using firstAccumulation=${JSON.stringify(
                    firstAccumulation
                )}, price=${price.toString()}, deltaTime=${deltaTime}`, async () => {
                    var secondCumulativePrice = BigNumber.from(firstAccumulation.cumulativePrice).add(
                        await calculateTimeWeightedPrice(mathUtil, BigNumber.from(price), BigNumber.from(deltaTime))
                    );
                    const secondTimestamp = firstAccumulation.timestamp + deltaTime;

                    // Process overflows
                    while (secondCumulativePrice.gt(MAX_CUMULATIVE_VALUE)) {
                        secondCumulativePrice = secondCumulativePrice.sub(
                            MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                        );
                    }

                    const secondAccumulation = {
                        cumulativePrice: secondCumulativePrice,
                        timestamp: secondTimestamp,
                    };

                    const calculatedPrice = await accumulator.calculatePrice(firstAccumulation, secondAccumulation);

                    if (price.eq(0)) {
                        // 0 and 1 both signal 0 price. We use 1 because of math errors with 0 (such as division).
                        expect(calculatedPrice).to.be.within(0, 1);
                    } else {
                        // Allow 0.0001% error
                        expect(calculatedPrice).to.be.closeTo(price, price.div(1000000));
                    }
                });
            });

            revertedWithTests.forEach(({ args, expected }) => {
                it(`Should revert${expected ? " with " + expected : ""} using accumulations {${JSON.stringify(
                    args[0]
                )}, ${JSON.stringify(args[1])}}`, async () => {
                    if (expected)
                        await expect(accumulator.calculatePrice(args[0], args[1])).to.be.revertedWith(expected);
                    else await expect(accumulator.calculatePrice(args[0], args[1])).to.be.reverted;
                });
            });
        });

        describe(contractName + "#update", () => {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;
            var mathUtil;

            var startingTime;

            const initialUpdateTests = [
                /* Basic tests w/ no price setting */
                {
                    args: {
                        initialPrice: undefined,
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: undefined,
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                /* Tests without overrides */
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("0"),
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("0"),
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("200"),
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: MAX_PRICE,
                    },
                    expectedReturn: true,
                },
                /* Tests with overrides - needsUpdate = false */
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("0"),
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("0"),
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("200"),
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                {
                    args: {
                        initialPrice: MAX_PRICE,
                        overrideNeedsUpdate: {
                            needsUpdate: false,
                        },
                    },
                    expectedReturn: false,
                },
                /* Tests with overrides - needsUpdate = true */
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("0"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("0"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("200"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: MAX_PRICE,
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
                        initialPrice: ethers.utils.parseEther("0"),
                        secondPrice: ethers.utils.parseEther("0"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("0"),
                        secondPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        secondPrice: ethers.utils.parseEther("0"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        secondPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("50"),
                        secondPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("100"),
                        secondPrice: ethers.utils.parseEther("50"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    args: {
                        initialPrice: ethers.utils.parseEther("25"),
                        secondPrice: ethers.utils.parseEther("75"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
                {
                    // ** Overflow test **
                    args: {
                        initialPrice: MAX_PRICE,
                        initialCumulativePrice: MAX_CUMULATIVE_VALUE,
                        secondPrice: ethers.utils.parseEther("100"),
                        overrideNeedsUpdate: {
                            needsUpdate: true,
                        },
                    },
                    expectedReturn: true,
                },
            ];

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();

                const mathUtilFactory = await ethers.getContractFactory("MathUtil");
                mathUtil = await mathUtilFactory.deploy();
                await mathUtil.deployed();

                await accumulator.overrideValidateObservation(true, true);

                startingTime = BigNumber.from(0);
            });

            async function verifyUpdate(
                expectedReturn,
                initialPrice,
                secondPrice = undefined,
                firstUpdateTime = 0,
                initialCumulativePrice = undefined
            ) {
                expect(await accumulator.callStatic.update(ethers.utils.hexZeroPad(GRT, 32))).to.equal(expectedReturn);

                const receipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));
                await receipt.wait();

                const updateTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

                const accumulation = await accumulator.getLastAccumulation(GRT);
                const observation = await accumulator.observations(GRT);

                var expectedCumulativePrice = 0;

                var expectedPrice = 0;

                var expectedTimestamp = startingTime;

                if (secondPrice) {
                    // Verifying a second update

                    if (expectedReturn) {
                        // An update should have occurred

                        // Increase time so that delta time from the last accumulation to the current is not 0
                        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + 10);

                        const priceFromAccumulation = await accumulator.calculatePrice(
                            await accumulator.getLastAccumulation(GRT),
                            await accumulator.getCurrentAccumulation(GRT)
                        );

                        const deltaTime = updateTime - firstUpdateTime;

                        // Calculate cumulatives
                        expectedCumulativePrice = initialCumulativePrice.add(
                            await calculateTimeWeightedPrice(
                                mathUtil,
                                BigNumber.from(initialPrice),
                                BigNumber.from(deltaTime)
                            )
                        );

                        // Process overflows
                        while (expectedCumulativePrice.gt(MAX_CUMULATIVE_VALUE)) {
                            expectedCumulativePrice = expectedCumulativePrice.sub(
                                MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                            );
                        }

                        expectedPrice = secondPrice;

                        expectedTimestamp = updateTime;

                        // Verify price from accumulations is correct
                        if (expectedPrice.eq(0)) {
                            // 1 is sometimes used as a zero price to avoid math errors
                            expect(priceFromAccumulation, "LFA - TL").to.be.within(0, 1);
                        } else {
                            // Allow 0.0001% error
                            expect(priceFromAccumulation, "LFA - TL").to.be.closeTo(
                                expectedPrice,
                                expectedPrice.div(1000000)
                            );
                        }

                        await expect(receipt, "2L - Log")
                            .to.emit(accumulator, "Updated")
                            .withArgs(GRT, expectedPrice, updateTime);
                    }
                } else {
                    // Verifying initial update

                    if (expectedReturn) {
                        // An update should have occurred

                        const deltaTime = updateTime - firstUpdateTime;

                        expectedCumulativePrice = initialCumulativePrice.add(
                            await calculateTimeWeightedPrice(mathUtil, BigNumber.from(0), BigNumber.from(deltaTime))
                        );

                        expectedPrice = initialPrice ?? 0;

                        expectedTimestamp = updateTime;

                        await expect(receipt, "1L - Log")
                            .to.emit(accumulator, "Updated")
                            .withArgs(GRT, expectedPrice, updateTime);
                    } else {
                        // An update should not have occurred

                        // Verify that the cumulative price doesn't change
                        expectedCumulativePrice = initialCumulativePrice;

                        await expect(receipt, "1L - NLog").to.not.emit(accumulator, "Updated");
                    }
                }

                // Allow 0.0001% error
                expect(
                    accumulation["cumulativePrice"],
                    "Cumulative price != expected (initial cumulative price: " +
                        initialCumulativePrice +
                        ", " +
                        "initial delta time: " +
                        (updateTime - firstUpdateTime) +
                        ", a: " +
                        (await calculateTimeWeightedPrice(mathUtil, BigNumber.from(0), updateTime - firstUpdateTime)) +
                        ")"
                ).to.be.closeTo(expectedCumulativePrice, expectedCumulativePrice.div(1000000));
                expect(accumulation["timestamp"], "AT").to.equal(expectedTimestamp);

                expect(observation["price"], "TL").to.equal(expectedPrice);
                expect(observation["timestamp"], "OT").to.equal(expectedTimestamp);

                // Now we make the accumulator catch up and verify the latest accumulations

                // No changes expected => return
                if (!expectedReturn || !initialPrice) return;

                // Ensure enough time passes to warrent an update
                await hre.timeAndMine.setTime((await currentBlockTimestamp()) + maxUpdateDelay);

                const receipt2 = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));
                await receipt2.wait();

                const updateTime2 = (await ethers.provider.getBlock(receipt2.blockNumber)).timestamp;

                const accumulation2 = await accumulator.getLastAccumulation(GRT);
                const observation2 = await accumulator.observations(GRT);

                const deltaTime2 = updateTime2 - updateTime;

                if (secondPrice) {
                    expectedCumulativePrice = BigNumber.from(expectedCumulativePrice).add(
                        await calculateTimeWeightedPrice(
                            mathUtil,
                            BigNumber.from(secondPrice),
                            BigNumber.from(deltaTime2)
                        )
                    );
                } else {
                    expectedCumulativePrice = BigNumber.from(expectedCumulativePrice).add(
                        await calculateTimeWeightedPrice(
                            mathUtil,
                            BigNumber.from(initialPrice),
                            BigNumber.from(deltaTime2)
                        )
                    );
                }

                // Process overflows
                while (expectedCumulativePrice.gt(MAX_CUMULATIVE_VALUE)) {
                    expectedCumulativePrice = expectedCumulativePrice.sub(
                        MAX_CUMULATIVE_VALUE.add(1) // = 2e256
                    );
                }

                // Allow 0.0001% error
                expect(accumulation2["cumulativePrice"], "Final CTL").to.be.closeTo(
                    expectedCumulativePrice,
                    expectedCumulativePrice.div(1000000)
                );
                expect(accumulation2["timestamp"], "Final AT").to.equal(updateTime2);

                expect(observation2["price"], "Final TL").to.equal(expectedPrice);
                expect(observation2["timestamp"], "Final OT").to.equal(updateTime2);
            }

            initialUpdateTests.forEach(({ args, expectedReturn }) => {
                it(`${expectedReturn ? "Should" : "Shouldn't"} update (initial) using args ${JSON.stringify(
                    args
                )}`, async function () {
                    // Initialize the first observation and accumulation with zero price
                    {
                        await accumulator.overrideNeedsUpdate(true, true);
                        await accumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) observation
                        await accumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) accumulation
                        [, startingTime] = await accumulator.getLastAccumulation(GRT);
                        await accumulator.overrideNeedsUpdate(false, false);
                        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + maxUpdateDelay);
                    }

                    const initialCumulativePrice = (await accumulator.getLastAccumulation(GRT))["cumulativePrice"];

                    if (args["initialPrice"]) {
                        // Configure price
                        await (await accumulator.setPrice(GRT, args["initialPrice"])).wait();
                    }

                    if (args["overrideNeedsUpdate"]) {
                        // Override needsUpdate
                        await (
                            await accumulator.overrideNeedsUpdate(true, args["overrideNeedsUpdate"]["needsUpdate"])
                        ).wait();
                    }

                    await verifyUpdate(
                        expectedReturn,
                        args["initialPrice"],
                        undefined,
                        startingTime,
                        initialCumulativePrice
                    );
                });
            });

            secondUpdateTests.forEach(({ args, expectedReturn }) => {
                it(`${expectedReturn ? "Should" : "Shouldn't"} update using args ${JSON.stringify(
                    args
                )}`, async function () {
                    // Initialize the first observation and accumulation with zero price
                    {
                        await accumulator.overrideNeedsUpdate(true, true);
                        await accumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) observation
                        await accumulator.update(ethers.utils.hexZeroPad(GRT, 32)); // Initialize first (0) accumulation
                        [, startingTime] = await accumulator.getLastAccumulation(GRT);
                        await accumulator.overrideNeedsUpdate(false, false);
                        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + maxUpdateDelay);
                    }

                    // Configure initial price
                    await (await accumulator.setPrice(GRT, args["initialPrice"])).wait();

                    // Initial update
                    const receipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));
                    await receipt.wait();

                    const updateTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

                    // Override cumulativePrice
                    if (args["initialCumulativePrice"]) {
                        await (
                            await accumulator.stubSetAccumulation(GRT, args["initialCumulativePrice"], updateTime)
                        ).wait();
                    }

                    const initialCumulativePrice = (await accumulator.getLastAccumulation(GRT))["cumulativePrice"];

                    // Configure price
                    await (await accumulator.setPrice(GRT, args["secondPrice"])).wait();

                    if (args["overrideNeedsUpdate"]) {
                        // Override needsUpdate
                        await (
                            await accumulator.overrideNeedsUpdate(true, args["overrideNeedsUpdate"]["needsUpdate"])
                        ).wait();
                    }

                    await verifyUpdate(
                        expectedReturn,
                        args["initialPrice"],
                        args["secondPrice"],
                        updateTime,
                        args["initialCumulativePrice"] ?? initialCumulativePrice
                    );
                });
            });

            it("Shouldn't update when deltaTime = 0", async () => {
                // Configure initial price
                const initialPrice = ethers.utils.parseEther("100");
                await (await accumulator.setPrice(GRT, initialPrice)).wait();

                // Override needsUpdate
                await (await accumulator.overrideNeedsUpdate(true, true)).wait();

                // Initial update
                const initialUpdateReceipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));
                await initialUpdateReceipt.wait();
                const initialUpdateTime = (await ethers.provider.getBlock(initialUpdateReceipt.blockNumber)).timestamp;

                // Configure price(1)
                const firstPrice = ethers.utils.parseEther("101");
                await (await accumulator.setPrice(GRT, firstPrice)).wait();

                // Disable automining
                await ethers.provider.send("evm_setAutomine", [false]);

                try {
                    // Perform update(1)
                    const firstUpdateReceipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));

                    // Configure price(2)
                    const updatePriceReceipt = await accumulator.setPrice(GRT, ethers.utils.parseEther("102"));

                    // Perform update(2)
                    const secondUpdateReceipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));

                    // Mine the transactions
                    await ethers.provider.send("evm_mine");

                    // Wait for transactions to be mined
                    await firstUpdateReceipt.wait();
                    await updatePriceReceipt.wait();
                    await secondUpdateReceipt.wait();

                    const firstUpdateTime = (await ethers.provider.getBlock(firstUpdateReceipt.blockNumber)).timestamp;

                    const deltaTime = firstUpdateTime - initialUpdateTime;

                    const expectedCumulativePrice = await calculateTimeWeightedPrice(
                        mathUtil,
                        BigNumber.from(initialPrice),
                        BigNumber.from(deltaTime)
                    );

                    const accumulation = await accumulator.getLastAccumulation(GRT);
                    const observation = await accumulator.observations(GRT);

                    // Allow 0.0001% error
                    expect(accumulation["cumulativePrice"], "CTL").to.be.closeTo(
                        expectedCumulativePrice,
                        expectedCumulativePrice.div(1000000)
                    );

                    expect(observation["price"], "TL").to.equal(firstPrice);
                } finally {
                    // Re-enable automining
                    await ethers.provider.send("evm_setAutomine", [true]);
                }
            });

            it("Shouldn't update when validateObservation returns false", async () => {
                // Configure initial price
                const initialPrice = ethers.utils.parseEther("100");
                await (await accumulator.setPrice(GRT, initialPrice)).wait();

                // Override needsUpdate
                await (await accumulator.overrideNeedsUpdate(true, true)).wait();

                // Initial update
                const initialUpdateReceipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));
                await initialUpdateReceipt.wait();
                const initialUpdateTime = (await ethers.provider.getBlock(initialUpdateReceipt.blockNumber)).timestamp;

                // Configure price(1)
                const firstPrice = ethers.utils.parseEther("200");
                await (await accumulator.setPrice(GRT, firstPrice)).wait();

                // Make validateObservation return false
                await accumulator.overrideValidateObservation(true, false);

                // Perform update(1)
                const firstUpdateReceipt = await accumulator.update(ethers.utils.hexZeroPad(GRT, 32));

                await expect(firstUpdateReceipt).to.not.emit(accumulator, "Updated");

                const accumulation = await accumulator.getLastAccumulation(GRT);
                const observation = await accumulator.observations(GRT);

                expect(accumulation["cumulativePrice"]).to.equal(0);
                expect(observation["price"]).to.equal(initialPrice);
                expect(observation["timestamp"]).to.equal(initialUpdateTime);
            });
        });

        describe(contractName + "#supportsInterface(interfaceId)", function () {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;
            var interfaceIds;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();
                interfaceIds = await interfaceIdsFactory.deploy();
            });

            it("Should support IPriceAccumulator", async () => {
                const interfaceId = await interfaceIds.iPriceAccumulator();
                expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });

            it("Should support IPriceOracle", async () => {
                const interfaceId = await interfaceIds.iPriceOracle();
                expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });

            it("Should support IQuoteToken", async () => {
                const interfaceId = await interfaceIds.iQuoteToken();
                expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });

            it("Should support IUpdateable", async () => {
                const interfaceId = await interfaceIds.iUpdateable();
                expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });

            it("Should support IAccumulator", async () => {
                const interfaceId = await interfaceIds.iAccumulator();
                expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });
        });

        describe(contractName + "#consultPrice(token)", function () {
            var oracle;

            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                oracle = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );

                // Time increases by 1 second with each block mined
                await hre.timeAndMine.setTimeIncrease(1);
            });

            it("Should revert when there's no observation", async () => {
                await expect(oracle["consultPrice(address)"](AddressZero)).to.be.revertedWith(
                    "PriceAccumulator: MISSING_OBSERVATION"
                );
            });

            it("Should get the set price (=1)", async () => {
                const price = BigNumber.from(1);

                await oracle.stubSetObservation(AddressZero, price, 1);

                expect(await oracle["consultPrice(address)"](AddressZero)).to.equal(price);
            });

            it("Should get the set price (=1e18)", async () => {
                const price = BigNumber.from(10).pow(18);

                await oracle.stubSetObservation(AddressZero, price, 1);

                expect(await oracle["consultPrice(address)"](AddressZero)).to.equal(price);
            });

            it("Should return fixed values when token == quoteToken", async function () {
                const price = await oracle["consultPrice(address)"](await oracle.quoteTokenAddress());

                const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

                expect(price).to.equal(expectedPrice);
            });
        });

        describe(contractName + "#consultPrice(token, maxAge = 0)", function () {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
            });

            tests = [0, 1, ethers.utils.parseUnits("1.0", 18), BigNumber.from(2).pow(112).sub(1)];

            tests.forEach(function (price) {
                it(`price = ${price}`, async function () {
                    await accumulator.setPrice(ethers.constants.AddressZero, price);

                    expect(
                        await accumulator["consultPrice(address,uint256)"](ethers.constants.AddressZero, 0)
                    ).to.equal(price);
                });
            });
        });

        describe(contractName + "#consultPrice(token, maxAge = 60)", function () {
            const MAX_AGE = 60;

            var oracle;

            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                oracle = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );

                // Time increases by 1 second with each block mined
                await hre.timeAndMine.setTimeIncrease(1);
            });

            it("Should revert when there's no observation", async () => {
                await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
                    "PriceAccumulator: MISSING_OBSERVATION"
                );
            });

            it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
                const observationTime = await currentBlockTimestamp();

                await oracle.stubSetObservation(AddressZero, 1, observationTime);

                const time = observationTime + MAX_AGE + 1;

                await hre.timeAndMine.setTime(time);

                expect(await currentBlockTimestamp()).to.equal(time);
                await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
                    "PriceAccumulator: RATE_TOO_OLD"
                );
            });

            it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
                const observationTime = await currentBlockTimestamp();

                await oracle.stubSetObservation(AddressZero, 1, observationTime);

                const time = observationTime + MAX_AGE;

                await hre.timeAndMine.setTime(time);

                expect(await currentBlockTimestamp()).to.equal(time);
                await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
            });

            it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
                const observationTime = await currentBlockTimestamp();

                await oracle.stubSetObservation(AddressZero, 1, observationTime);

                const time = observationTime + MAX_AGE - 1;

                await hre.timeAndMine.setTime(time);

                expect(await currentBlockTimestamp()).to.equal(time);
                await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
            });

            it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
                const observationTime = (await currentBlockTimestamp()) + 10;

                await oracle.stubSetObservation(AddressZero, 1, observationTime);

                const time = observationTime;

                await hre.timeAndMine.setTime(time);

                expect(await currentBlockTimestamp()).to.equal(time);
                await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
            });

            it("Should get the set price (=1)", async () => {
                const observationTime = await currentBlockTimestamp();
                const price = BigNumber.from(1);

                await oracle.stubSetObservation(AddressZero, price, observationTime);

                expect(await oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.equal(price);
            });

            it("Should get the set price (=1e18)", async () => {
                const observationTime = await currentBlockTimestamp();
                const price = BigNumber.from(10).pow(18);

                await oracle.stubSetObservation(AddressZero, price, observationTime);

                expect(await oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.equal(price);
            });

            it("Should return fixed values when token == quoteToken", async function () {
                const price = await oracle["consultPrice(address,uint256)"](await oracle.quoteTokenAddress(), MAX_AGE);

                const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

                expect(price).to.equal(expectedPrice);
            });
        });

        describe(contractName + "#validateObservation(token, price)", function () {
            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var accumulator;
            var accumulatorCaller;
            var token;

            beforeEach(async () => {
                const accumulatorFactory = await ethers.getContractFactory(stubContractName);
                const accumulatorCallerFactory = await ethers.getContractFactory(stubCallerContractName);
                const erc20Factory = await ethers.getContractFactory("FakeERC20");

                accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    USDC,
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
                await accumulator.deployed();

                accumulatorCaller = await accumulatorCallerFactory.deploy(accumulator.address);

                token = await erc20Factory.deploy("Token", "T", 18);
                await token.deployed();
            });

            it("Should revert when caller is a smart contract", async () => {
                await expect(accumulatorCaller.stubValidateObservation(token.address, 0)).to.be.revertedWith(
                    "PriceAccumulator: MUST_BE_EOA"
                );
            });

            describe("Caller is not a smart contract", function () {
                it("Should return true when provided price matches the observed price", async function () {
                    // "observed"
                    const oPrice = ethers.utils.parseUnits("1.0", 18);

                    // provided externally
                    const pPrice = oPrice;
                    const pTimestamp = await currentBlockTimestamp();

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [token.address, pPrice, pTimestamp]
                    );

                    expect(await accumulator.callStatic.stubValidateObservation(updateData, oPrice)).to.equal(true);

                    const tx = await accumulator.stubValidateObservation(updateData, oPrice);
                    const receipt = await tx.wait();
                    const timestamp = await blockTimestamp(receipt.blockNumber);

                    await expect(tx)
                        .to.emit(accumulator, "ValidationPerformed")
                        .withArgs(token.address, oPrice, pPrice, timestamp, pTimestamp, true);
                });

                it("Should return false when the provided time is 1 minute after the current time", async function () {
                    // "observed"
                    const oPrice = ethers.utils.parseUnits("1.0", 18);

                    // provided externally
                    const pPrice = oPrice;
                    const pTimestamp = (await currentBlockTimestamp()) + 60;

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [token.address, pPrice, pTimestamp]
                    );

                    expect(await accumulator.callStatic.stubValidateObservation(updateData, oPrice)).to.equal(false);

                    const tx = await accumulator.stubValidateObservation(updateData, oPrice);
                    const receipt = await tx.wait();
                    const timestamp = await blockTimestamp(receipt.blockNumber);

                    await expect(tx)
                        .to.emit(accumulator, "ValidationPerformed")
                        .withArgs(token.address, oPrice, pPrice, timestamp, pTimestamp, false);
                });

                it("Should return true when the provided time is 2-3 seconds after the current time (some time drift is okay)", async function () {
                    // "observed"
                    const oPrice = ethers.utils.parseUnits("1.0", 18);

                    // provided externally
                    const pPrice = oPrice;
                    const pTimestamp = (await currentBlockTimestamp()) + 2;

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [token.address, pPrice, pTimestamp]
                    );

                    expect(await accumulator.callStatic.stubValidateObservation(updateData, oPrice)).to.equal(true);

                    const tx = await accumulator.stubValidateObservation(updateData, oPrice);
                    const receipt = await tx.wait();
                    const timestamp = await blockTimestamp(receipt.blockNumber);

                    await expect(tx)
                        .to.emit(accumulator, "ValidationPerformed")
                        .withArgs(token.address, oPrice, pPrice, timestamp, pTimestamp, true);
                });

                it("Should return false when the provided time is 10 minutes before the current time (the tx took too long to be mined)", async function () {
                    // "observed"
                    const oPrice = ethers.utils.parseUnits("1.0", 18);

                    // provided externally
                    const pPrice = oPrice;
                    const pTimestamp = (await currentBlockTimestamp()) - 600;

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [token.address, pPrice, pTimestamp]
                    );

                    expect(await accumulator.callStatic.stubValidateObservation(updateData, oPrice)).to.equal(false);

                    const tx = await accumulator.stubValidateObservation(updateData, oPrice);
                    const receipt = await tx.wait();
                    const timestamp = await blockTimestamp(receipt.blockNumber);

                    await expect(tx)
                        .to.emit(accumulator, "ValidationPerformed")
                        .withArgs(token.address, oPrice, pPrice, timestamp, pTimestamp, false);
                });

                it("Should return true when the provided time is 2 minutes before the current time (some tx mining delay is okay)", async function () {
                    // "observed"
                    const oPrice = ethers.utils.parseUnits("1.0", 18);

                    // provided externally
                    const pPrice = oPrice;
                    const pTimestamp = (await currentBlockTimestamp()) - 120;

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [token.address, pPrice, pTimestamp]
                    );

                    expect(await accumulator.callStatic.stubValidateObservation(updateData, oPrice)).to.equal(true);

                    const tx = await accumulator.stubValidateObservation(updateData, oPrice);
                    const receipt = await tx.wait();
                    const timestamp = await blockTimestamp(receipt.blockNumber);

                    await expect(tx)
                        .to.emit(accumulator, "ValidationPerformed")
                        .withArgs(token.address, oPrice, pPrice, timestamp, pTimestamp, true);
                });

                it("Should return false when the observed price is too different from the provided value", async function () {
                    // "observed"
                    const oPrice = ethers.utils.parseUnits("1.0", 18);

                    // provided externally
                    const pPrice = oPrice.mul(2);
                    const pTimestamp = await currentBlockTimestamp();

                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint", "uint"],
                        [token.address, pPrice, pTimestamp]
                    );

                    expect(await accumulator.callStatic.stubValidateObservation(updateData, oPrice)).to.equal(false);

                    const tx = await accumulator.stubValidateObservation(updateData, oPrice);
                    const receipt = await tx.wait();
                    const timestamp = await blockTimestamp(receipt.blockNumber);

                    await expect(tx)
                        .to.emit(accumulator, "ValidationPerformed")
                        .withArgs(token.address, oPrice, pPrice, timestamp, pTimestamp, false);
                });
            });
        });
    });
}

describePriceAccumulatorTests(
    "PriceAccumulator",
    "PriceAccumulatorStub",
    "PriceAccumulatorStubCaller",
    "ArithmeticAveraging",
    async (mathUtil, price, time) => {
        return price.mul(time);
    }
);

describePriceAccumulatorTests(
    "PriceAccumulator",
    "PriceAccumulatorStub",
    "PriceAccumulatorStubCaller",
    "GeometricAveraging",
    async (mathUtil, price, time) => {
        if (price.eq(0)) {
            // ln(0) is undefined
            price = BigNumber.from(1);
        }

        return ln(toBn(price.toString())).mul(time);
    }
);

describePriceAccumulatorTests(
    "PriceAccumulator",
    "PriceAccumulatorStub",
    "PriceAccumulatorStubCaller",
    "HarmonicAveragingWS192",
    async (mathUtil, price, time) => {
        if (price.eq(0)) {
            // division by zero is undefined
            price = BigNumber.from(1);
        }

        time = await mathUtil.shl(time, 192); // shift time to the left by 192 bits

        return time.div(price);
    }
);
