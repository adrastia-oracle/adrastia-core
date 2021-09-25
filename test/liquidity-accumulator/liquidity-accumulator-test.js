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
        liquidityAccumulator = await LiquidityAccumulator.deploy(USDC, TWO_PERCENT_CHANGE, minUpdateDelay, maxUpdateDelay);
        await liquidityAccumulator.deployed();

        // Configure liquidity
        await liquidityAccumulator.setLiquidity(GRT, 100, 100);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        // Initial update
        const updateReceipt = await liquidityAccumulator.update(GRT);
        updateTime = (await ethers.provider.getBlock(updateReceipt.blockNumber)).timestamp;
    });

    it("Shouldn't need update if delta time is less than the min update delay (update threshold passed)", async () => {
        // Update liquidity (100% change => greater than update threshold)
        await liquidityAccumulator.setLiquidity(GRT, 200, 200);

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
        // Update liquidity (100% change => greater than update threshold)
        await liquidityAccumulator.setLiquidity(GRT, 200, 200);

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
        // Update liquidity (100% change => greater than update threshold)
        await liquidityAccumulator.setLiquidity(GRT, 200, 200);

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