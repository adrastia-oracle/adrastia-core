const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60; // At most (optimistically) 60 seconds between every update

const DEFAULT_DECIMALS = 8;
const DEFAULT_TARGET = ethers.utils.parseUnits("0.9", DEFAULT_DECIMALS); // 90%

const ERROR_ZERO = ethers.utils.parseUnits("1", 18);

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("AlocUtilizationAndErrorAccumulator#constructor", function () {
    var alocStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        alocStubFactory = await ethers.getContractFactory("AlocStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("AlocUtilizationAndErrorAccumulator");
    });

    it("Works with defaults", async function () {
        const aloc = await alocStubFactory.deploy();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await aloc.deployed();
        await averagingStrategy.deployed();

        const accumulator = await accumulatorFactory.deploy(
            true,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await accumulator.liquidityDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await accumulator.getTarget(aloc.address)).to.equal(DEFAULT_TARGET);
    });
});

describe("AlocUtilizationAndErrorAccumulator#fetchValue - Considering empty ALOC as 100% utilization", function () {
    var aloc;
    var accumulator;

    beforeEach(async function () {
        const alocStubFactory = await ethers.getContractFactory("AlocStub");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AlocUtilizationAndErrorAccumulatorStub");

        aloc = await alocStubFactory.deploy();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            true,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await aloc.deployed();
        await accumulator.deployed();
    });

    it("Returns 100% utilization when the aloc is at zero utilization but has no liquidity", async function () {
        await aloc.stubSetUtilization(0);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 0% utilization when the aloc is at zero utilization but has liquidity", async function () {
        await aloc.stubSetUtilization(0);
        await aloc.stubSetLiquidAssets(1);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits("0", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 1% utilization when the aloc is at 1% utilization", async function () {
        const utilizationStr = "0.01";

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(1);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 50% utilization when the aloc is at 50% utilization", async function () {
        const utilizationStr = "0.5";

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns target utilization when the aloc is at target utilization", async function () {
        const utilizationStr = ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS);

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 100% utilization when the aloc is at 100% utilization", async function () {
        const utilizationStr = "1";

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });
});

describe("AlocUtilizationAndErrorAccumulator#fetchValue - Considering empty ALOC as 0% utilization", function () {
    var aloc;
    var accumulator;

    beforeEach(async function () {
        const alocStubFactory = await ethers.getContractFactory("AlocStub");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AlocUtilizationAndErrorAccumulatorStub");

        aloc = await alocStubFactory.deploy();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            false,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await aloc.deployed();
        await accumulator.deployed();
    });

    it("Returns 0% utilization when the aloc is at zero utilization but has no liquidity", async function () {
        await aloc.stubSetUtilization(0);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits("0", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 0% utilization when the aloc is at zero utilization but has liquidity", async function () {
        await aloc.stubSetUtilization(0);
        await aloc.stubSetLiquidAssets(1);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits("0", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 1% utilization when the aloc is at 1% utilization", async function () {
        const utilizationStr = "0.01";

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(1);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 50% utilization when the aloc is at 50% utilization", async function () {
        const utilizationStr = "0.5";

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns target utilization when the aloc is at target utilization", async function () {
        const utilizationStr = ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS);

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 100% utilization when the aloc is at 100% utilization", async function () {
        const utilizationStr = "1";

        const alocBasis = await aloc.BASIS_PRECISION();
        const alocDecimals = Math.log10(alocBasis.toNumber());
        const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);

        await aloc.stubSetUtilization(alocUtilization);
        await aloc.stubSetLiquidAssets(0);

        const utilization = await accumulator.stubFetchValue(aloc.address);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });
});

describe("AlocUtilizationAndErrorAccumulator#fetchLiquidity", function () {
    var aloc;
    var accumulator;

    beforeEach(async function () {
        const alocStubFactory = await ethers.getContractFactory("AlocStub");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AlocUtilizationAndErrorAccumulatorStub");

        aloc = await alocStubFactory.deploy();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            true,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await aloc.deployed();
        await accumulator.deployed();
    });

    function calculateError(utilization, target) {
        if (target.gte(utilization)) {
            return ERROR_ZERO.add(target.sub(utilization));
        } else {
            return ERROR_ZERO.sub(utilization.sub(target));
        }
    }

    function humanReadableError(error) {
        return ethers.utils.formatUnits(error.sub(ERROR_ZERO), DEFAULT_DECIMALS - 2) + "%";
    }

    const ERROR_100 = calculateError(ethers.utils.parseUnits("1", DEFAULT_DECIMALS), DEFAULT_TARGET);
    const ERROR_0 = calculateError(ethers.utils.parseUnits("0", DEFAULT_DECIMALS), DEFAULT_TARGET);
    const ERROR_1 = calculateError(ethers.utils.parseUnits("0.01", DEFAULT_DECIMALS), DEFAULT_TARGET);
    const ERROR_50 = calculateError(ethers.utils.parseUnits("0.5", DEFAULT_DECIMALS), DEFAULT_TARGET);
    const ERROR_TARGET = calculateError(DEFAULT_TARGET, DEFAULT_TARGET);

    it(
        "Returns 100% utilization and an error of " +
            ERROR_100 +
            " (error=" +
            humanReadableError(ERROR_100) +
            ", target=" +
            ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS - 2) +
            "%) " +
            "when the aloc is at zero utilization but has no liquidity",
        async function () {
            await aloc.stubSetUtilization(0);
            await aloc.stubSetLiquidAssets(0);

            const [utilization, error] = await accumulator.stubFetchLiquidity(aloc.address);
            const expectedUtilization = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);

            expect(utilization).to.eq(expectedUtilization);
            expect(error).to.eq(ERROR_100);
        }
    );

    it(
        "Returns 0% utilization and an error of " +
            ERROR_0 +
            " (error=" +
            humanReadableError(ERROR_0) +
            ", target=" +
            ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS - 2) +
            "%) " +
            "when the aloc is at zero utilization and has liquidity",
        async function () {
            await aloc.stubSetUtilization(0);
            await aloc.stubSetLiquidAssets(1);

            const [utilization, error] = await accumulator.stubFetchLiquidity(aloc.address);
            const expectedUtilization = ethers.utils.parseUnits("0", DEFAULT_DECIMALS);

            expect(utilization).to.eq(expectedUtilization);
            expect(error).to.eq(ERROR_0);
        }
    );

    it(
        "Returns 1% utilization and an error of " +
            ERROR_1 +
            " (error=" +
            humanReadableError(ERROR_1) +
            ", target=" +
            ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS - 2) +
            "%) " +
            "when the aloc is at that utilization",
        async function () {
            const utilizationStr = "0.01";

            const alocBasis = await aloc.BASIS_PRECISION();
            const alocDecimals = Math.log10(alocBasis.toNumber());
            const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);
            await aloc.stubSetUtilization(alocUtilization);
            await aloc.stubSetLiquidAssets(1);

            const [utilization, error] = await accumulator.stubFetchLiquidity(aloc.address);
            const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

            expect(utilization).to.eq(expectedUtilization);
            expect(error).to.eq(ERROR_1);
        }
    );

    it(
        "Returns 50% utilization and an error of " +
            ERROR_50 +
            " (error=" +
            humanReadableError(ERROR_50) +
            ", target=" +
            ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS - 2) +
            "%) " +
            "when the aloc is at that utilization",
        async function () {
            const utilizationStr = "0.5";

            const alocBasis = await aloc.BASIS_PRECISION();
            const alocDecimals = Math.log10(alocBasis.toNumber());
            const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);
            await aloc.stubSetUtilization(alocUtilization);
            await aloc.stubSetLiquidAssets(1);

            const [utilization, error] = await accumulator.stubFetchLiquidity(aloc.address);
            const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

            expect(utilization).to.eq(expectedUtilization);
            expect(error).to.eq(ERROR_50);
        }
    );

    it(
        "Returns target utilization and an error of " +
            ERROR_TARGET +
            " (error=" +
            humanReadableError(ERROR_TARGET) +
            ", target=" +
            ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS - 2) +
            "%) " +
            "when the aloc is at that utilization",
        async function () {
            const utilizationStr = ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS);

            const alocBasis = await aloc.BASIS_PRECISION();
            const alocDecimals = Math.log10(alocBasis.toNumber());
            const alocUtilization = ethers.utils.parseUnits(utilizationStr, alocDecimals);
            await aloc.stubSetUtilization(alocUtilization);
            await aloc.stubSetLiquidAssets(1);

            const [utilization, error] = await accumulator.stubFetchLiquidity(aloc.address);
            const expectedUtilization = DEFAULT_TARGET;

            expect(utilization).to.eq(expectedUtilization);
            expect(error).to.eq(ERROR_TARGET);
        }
    );
});
