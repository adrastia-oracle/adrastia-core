const { BigNumber } = require("ethers");
const { expect } = require("chai");

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const GRT = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

describe("LiquidityAccumulator#needsUpdate", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    var updateTime;

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
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

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        // Initial update
        const updateReceipt = await liquidityAccumulator.update(GRT);
        updateTime = (await ethers.provider.getBlock(updateReceipt.blockNumber)).timestamp;
    });

    it("Shouldn't need update if delta time is less than the min update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

        // deltaTime = 1
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);

        // deltaTime = minUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);
    });

    it("Shouldn't need update if delta time is less than the min update delay (update threshold not passed)", async () => {
        // deltaTime = 1
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);

        // deltaTime = minUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);
    });

    it("Should need update if delta time is within min and max update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

        // deltaTime = minUpdateDelay
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);

        // deltaTime = maxUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);
    });

    it("Shouldn't need update if delta time is within min and max update delay (update threshold not passed)", async () => {
        // deltaTime = minUpdateDelay
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);

        // deltaTime = maxUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);
    });

    it("Should need update if delta time is >= max update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

        // deltaTime = maxUpdateDelay
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);

        // deltaTime = maxUpdateDelay + 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);
    });

    it("Should need update if delta time is >= max update delay (update threshold not passed)", async () => {
        // deltaTime = maxUpdateDelay
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);

        // deltaTime = maxUpdateDelay + 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);
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
    ];

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
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
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                { cumulativeTokenLiquidity: 1, cumulativeQuoteTokenLiquidity: 1, timestamp: 1 },
            ],
            expected: [1, 1],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 1
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 1, timestamp: 1 },
            ],
            expected: [0, 1],
        },
        {
            // deltaCumulativeTokenLiquidity = 1
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                { cumulativeTokenLiquidity: 1, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
            ],
            expected: [1, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 0 },
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
            ],
            expected: [0, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 0 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 1 },
            ],
            expected: [1000000, 1000000],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 0 },
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 1 },
            ],
            expected: [0, 1000000],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 0 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
            ],
            expected: [1000000, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 10
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 0 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 10 },
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
                    cumulativeTokenLiquidity: ethers.constants.MaxUint256,
                    cumulativeQuoteTokenLiquidity: ethers.constants.MaxUint256,
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
            expected: "LiquidityAccumulator: delta time cannot be 0.",
        },
    ];

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
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
        it(`Should revert with '${expected}' using accumulations {${JSON.stringify(args[0])}, ${JSON.stringify(
            args[1]
        )}}`, async () => {
            await expect(liquidityAccumulator.calculateLiquidity(args[0], args[1])).to.be.revertedWith(expected);
        });
    });
});
