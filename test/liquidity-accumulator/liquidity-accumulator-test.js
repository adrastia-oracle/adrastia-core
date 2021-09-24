const { expect } = require("chai");

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const GRT = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

describe("LiquidityAccumulator#needsUpdate", function () {
    it("Shouldn't need update if delta time is less than the min update delay", async function () {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
        const liquidityAccumulator = await LiquidityAccumulator.deploy(USDC, TWO_PERCENT_CHANGE, 10000, 30000);
        await liquidityAccumulator.deployed();

        // Configure liquidity
        await liquidityAccumulator.setLiquidity(GRT, 100, 100);

        // Initial update
        await liquidityAccumulator.update(GRT);

        // TODO: Hardset time to various values and test each

        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);
    });
});