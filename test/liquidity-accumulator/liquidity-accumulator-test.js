const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

const MAX_CUMULATIVE_VALUE = BigNumber.from(2).pow(112).sub(1);

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("LiquidityAccumulator#fetchLiquidity", function () {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#getCurrentAccumulation", function () {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#needsUpdate", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    var updateTime;

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#canUpdate", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var accumulator;

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#changeThresholdSurpassed", () => {
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
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#calculateLiquidity", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    const tests = [
        {
            // deltaCumulativeTokenLiquidity = 1
            // deltaCumulativeQuoteTokenLiquidity = 1
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 1, cumulativeQuoteTokenLiquidity: 1, timestamp: 2 },
            ],
            expected: [1, 1],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 1
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 1, timestamp: 2 },
            ],
            expected: [0, 1],
        },
        {
            // deltaCumulativeTokenLiquidity = 1
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 1, cumulativeQuoteTokenLiquidity: 0, timestamp: 2 },
            ],
            expected: [1, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 2 },
            ],
            expected: [0, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 2 },
            ],
            expected: [1000000, 1000000],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 2 },
            ],
            expected: [0, 1000000],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 2 },
            ],
            expected: [1000000, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 10
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 11 },
            ],
            expected: [100000, 100000],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 100000
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 100000 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 200000 },
            ],
            expected: [10, 10],
        },
        {
            // **Overflow test**
            // deltaCumulativeTokenLiquidity = 10
            // deltaCumulativeQuoteTokenLiquidity = 10
            // deltaTime = 1
            args: [
                {
                    cumulativeTokenLiquidity: MAX_CUMULATIVE_VALUE,
                    cumulativeQuoteTokenLiquidity: MAX_CUMULATIVE_VALUE,
                    timestamp: 10,
                },
                { cumulativeTokenLiquidity: 9, cumulativeQuoteTokenLiquidity: 9, timestamp: 11 },
            ],
            expected: [10, 10],
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
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
        liquidityAccumulator = await LiquidityAccumulator.deploy(
            USDC,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
        await liquidityAccumulator.deployed();
    });

    tests.forEach(({ args, expected }) => {
        it(`Should evaluate to ${expected} using accumulations {${JSON.stringify(args[0])}, ${JSON.stringify(
            args[1]
        )}}`, async () => {
            const received = await liquidityAccumulator.calculateLiquidity(args[0], args[1]);
            expect(received[0]).to.equal(expected[0]);
            expect(received[1]).to.equal(expected[1]);
        });
    });

    revertedWithTests.forEach(({ args, expected }) => {
        it(`Should revert${expected ? " with " + expected : ""} using accumulations {${JSON.stringify(
            args[0]
        )}, ${JSON.stringify(args[1])}}`, async () => {
            if (expected)
                await expect(liquidityAccumulator.calculateLiquidity(args[0], args[1])).to.be.revertedWith(expected);
            else await expect(liquidityAccumulator.calculateLiquidity(args[0], args[1])).to.be.reverted;
        });
    });
});

describe("LiquidityAccumulator#update", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

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
                    token: MAX_CUMULATIVE_VALUE,
                    quoteToken: MAX_CUMULATIVE_VALUE,
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
                    token: MAX_CUMULATIVE_VALUE,
                    quoteToken: MAX_CUMULATIVE_VALUE,
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
                    token: MAX_CUMULATIVE_VALUE,
                    quoteToken: MAX_CUMULATIVE_VALUE,
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
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
        liquidityAccumulator = await LiquidityAccumulator.deploy(
            USDC,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
        await liquidityAccumulator.deployed();

        await liquidityAccumulator.overrideValidateObservation(true, true);

        startingTime = BigNumber.from(0);
    });

    async function verifyUpdate(expectedReturn, initialLiquidity, secondLiquidity = undefined, firstUpdateTime = 0) {
        expect(await liquidityAccumulator.callStatic.update(ethers.utils.hexZeroPad(GRT, 32))).to.equal(expectedReturn);

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

                // Calculate cumulatives
                /*expectedCumulativeTokenLiquidity = BigNumber.from(initialLiquidity["token"]).add(
                    BigNumber.from(BigNumber.from(secondLiquidity["token"]).mul(BigNumber.from(deltaTime)))
                );
                expectedCumulativeQuoteTokenLiquidity = BigNumber.from(initialLiquidity["quoteToken"]).add(
                    BigNumber.from(BigNumber.from(secondLiquidity["quoteToken"]).mul(BigNumber.from(deltaTime)))
                );*/

                expectedCumulativeTokenLiquidity = BigNumber.from(initialLiquidity["token"]).mul(
                    BigNumber.from(deltaTime)
                );
                expectedCumulativeQuoteTokenLiquidity = BigNumber.from(initialLiquidity["quoteToken"]).mul(
                    BigNumber.from(deltaTime)
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
                expect(liquidityFromAccumulation["tokenLiquidity"], "LFA - TL").to.equal(expectedTokenLiquidity);
                expect(liquidityFromAccumulation["quoteTokenLiquidity"], "LFA - QTL").to.equal(
                    expectedQuoteTokenLiquidity
                );

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

                expectedCumulativeTokenLiquidity = 0;
                expectedCumulativeQuoteTokenLiquidity = 0;

                expectedTokenLiquidity = initialLiquidity["token"] ?? 0;
                expectedQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                expectedTimestamp = updateTime;

                await expect(receipt, "1L - Log")
                    .to.emit(liquidityAccumulator, "Updated")
                    .withArgs(GRT, expectedTokenLiquidity, expectedQuoteTokenLiquidity, updateTime);
            } else {
                // An update should not have occurred

                await expect(receipt, "1L - NLog").to.not.emit(liquidityAccumulator, "Updated");
            }
        }

        expect(accumulation["cumulativeTokenLiquidity"], "CTL").to.equal(expectedCumulativeTokenLiquidity);
        expect(accumulation["cumulativeQuoteTokenLiquidity"], "CQTL").to.equal(expectedCumulativeQuoteTokenLiquidity);
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
                BigNumber.from(secondLiquidity["token"]).mul(BigNumber.from(deltaTime2))
            );
            expectedCumulativeQuoteTokenLiquidity = BigNumber.from(expectedCumulativeQuoteTokenLiquidity).add(
                BigNumber.from(secondLiquidity["quoteToken"]).mul(BigNumber.from(deltaTime2))
            );
        } else {
            expectedCumulativeTokenLiquidity = BigNumber.from(expectedCumulativeTokenLiquidity).add(
                BigNumber.from(initialLiquidity["token"]).mul(BigNumber.from(deltaTime2))
            );
            expectedCumulativeQuoteTokenLiquidity = BigNumber.from(expectedCumulativeQuoteTokenLiquidity).add(
                BigNumber.from(initialLiquidity["quoteToken"]).mul(BigNumber.from(deltaTime2))
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

        expect(accumulation2["cumulativeTokenLiquidity"], "Final CTL").to.equal(expectedCumulativeTokenLiquidity);
        expect(accumulation2["cumulativeQuoteTokenLiquidity"], "Final CQTL").to.equal(
            expectedCumulativeQuoteTokenLiquidity
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

            await verifyUpdate(expectedReturn, args["initialLiquidity"]);
        });
    });

    secondUpdateTests.forEach(({ args, expectedReturn }) => {
        it(`${expectedReturn ? "Should" : "Shouldn't"} update using args ${JSON.stringify(args)}`, async function () {
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

            await verifyUpdate(expectedReturn, args["initialLiquidity"], args["secondLiquidity"], updateTime);
        });
    });

    it("Shouldn't update when deltaTime = 0", async () => {
        // Configure initial liquidity
        const initialTokenLiquidity = ethers.utils.parseEther("100");
        const initialQuoteTokenLiquidity = ethers.utils.parseEther("100");
        await (await liquidityAccumulator.setLiquidity(GRT, initialTokenLiquidity, initialQuoteTokenLiquidity)).wait();

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

            const expectedCumulativeTokenLiquidity = initialTokenLiquidity.add(
                initialTokenLiquidity.mul(BigNumber.from(deltaTime))
            );
            const expectedCumulativeQuoteTokenLiquidity = initialQuoteTokenLiquidity.add(
                initialQuoteTokenLiquidity.mul(BigNumber.from(deltaTime))
            );

            const accumulation = await liquidityAccumulator.getLastAccumulation(GRT);
            const observation = await liquidityAccumulator.observations(GRT);

            expect(accumulation["cumulativeTokenLiquidity"], "CTL").to.equal(expectedCumulativeTokenLiquidity);
            expect(accumulation["cumulativeQuoteTokenLiquidity"], "CQTL").to.equal(
                expectedCumulativeQuoteTokenLiquidity
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
        await (await liquidityAccumulator.setLiquidity(GRT, initialTokenLiquidity, initialQuoteTokenLiquidity)).wait();

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

        expect(accumulation["cumulativeTokenLiquidity"]).to.equal(initialTokenLiquidity);
        expect(accumulation["cumulativeQuoteTokenLiquidity"]).to.equal(initialQuoteTokenLiquidity);

        expect(observation["tokenLiquidity"]).to.equal(initialTokenLiquidity);
        expect(observation["quoteTokenLiquidity"]).to.equal(initialQuoteTokenLiquidity);
        expect(observation["timestamp"]).to.equal(initialUpdateTime);
    });
});

describe("LiquidityAccumulator#supportsInterface(interfaceId)", function () {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;
    var interfaceIds;

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#consultLiquidity(token)", function () {
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
        const accumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#consultLiquidity(token, maxAge = 0)", function () {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var accumulator;

    beforeEach(async () => {
        const accumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        accumulator = await accumulatorFactory.deploy(USDC, TWO_PERCENT_CHANGE, minUpdateDelay, maxUpdateDelay);
    });

    tests = [0, 1, ethers.utils.parseUnits("1.0", 18), BigNumber.from(2).pow(112).sub(1)];

    tests.forEach(function (tokenLiquidity) {
        tests.forEach(function (quoteTokenLiquidity) {
            it(`tokenLiquidity = ${tokenLiquidity} and quoteTokenLiquidity = ${quoteTokenLiquidity}`, async function () {
                await accumulator.setLiquidity(ethers.constants.AddressZero, tokenLiquidity, quoteTokenLiquidity);

                const result = await accumulator["consultLiquidity(address,uint256)"](ethers.constants.AddressZero, 0);

                expect(result["tokenLiquidity"], "Token liquidity").to.equal(tokenLiquidity);
                expect(result["quoteTokenLiquidity"], "Quote token liquidity").to.equal(quoteTokenLiquidity);
            });
        });
    });
});

describe("LiquidityAccumulator#consultLiquidity(token, maxAge = 60)", function () {
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
        const accumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
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

describe("LiquidityAccumulator#validateObservation(token, tokenLiquidity, quoteTokenLiquidity)", function () {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var accumulator;
    var accumulatorCaller;
    var token;

    beforeEach(async () => {
        const accumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        const accumulatorCallerFactory = await ethers.getContractFactory("LiquidityAccumulatorStubCaller");
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
                await accumulator.callStatic.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity)
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
                await accumulator.callStatic.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity)
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
                await accumulator.callStatic.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity)
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
                await accumulator.callStatic.stubValidateObservation(updateData, oTokenLiquidity, oQuoteTokenLiquidity)
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
