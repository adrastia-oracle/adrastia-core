const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers, timeAndMine } = require("hardhat");
const { blockTimestamp, currentBlockTimestamp } = require("../../src/time");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60; // At most (optimistically) 60 seconds between every update

const DEFAULT_DECIMALS = 8;
const DEFAULT_TARGET = ethers.utils.parseUnits("0.9", DEFAULT_DECIMALS); // 90%

const ERROR_ZERO = ethers.utils.parseUnits("1", 18);

function calculateError(utilization, target) {
    if (target.gte(utilization)) {
        return ERROR_ZERO.add(target.sub(utilization));
    } else {
        return ERROR_ZERO.sub(utilization.sub(target));
    }
}

describe("AdrastiaUtilizationAndErrorAccumulator#constructor", function () {
    var sbOracleStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        sbOracleStubFactory = await ethers.getContractFactory("MockOracle");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("AdrastiaUtilizationAndErrorAccumulator");
    });

    it("Works with defaults", async function () {
        const sbOracle = await sbOracleStubFactory.deploy(AddressZero);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await sbOracle.deployed();
        await averagingStrategy.deployed();

        const accumulator = await accumulatorFactory.deploy(
            sbOracle.address,
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
        expect(await accumulator.getTarget(USDC)).to.equal(DEFAULT_TARGET);
        expect(await accumulator.adrastiaOracle()).to.equal(sbOracle.address);
    });
});

describe("AdrastiaUtilizationAndErrorAccumulator#fetchValue - Considering empty market as 100% utilization", function () {
    var sbOracle;
    var accumulator;

    beforeEach(async function () {
        const sbOracleStubFactory = await ethers.getContractFactory("MockOracle");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AdrastiaUtilizationAndErrorAccumulatorStub");

        sbOracle = await sbOracleStubFactory.deploy(AddressZero);
        await sbOracle.deployed();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            sbOracle.address,
            true,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await accumulator.deployed();
    });

    it("Returns 100% utilization when the market is at zero utilization but has no liquidity", async function () {
        await sbOracle.stubSetObservationNow(USDC, 0, 0, 0);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 0% utilization when the market is at zero utilization but has liquidity", async function () {
        const totalBorrow = 0;
        const totalSupply = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits("0", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 1% utilization when the market is at 1% utilization", async function () {
        const totalBorrow = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);
        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits("0.01", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 50% utilization when the market is at 50% utilization", async function () {
        const totalBorrow = ethers.utils.parseUnits("50", DEFAULT_DECIMALS);
        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits("0.5", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns target utilization when the market is at target utilization", async function () {
        const utilizationStr = ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS);

        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = DEFAULT_TARGET.mul(totalSupply).div(BigNumber.from(10).pow(DEFAULT_DECIMALS));
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 100% utilization when the market is at 100% utilization", async function () {
        const utilizationStr = "1";

        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = totalSupply;
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });
});

describe("AdrastiaUtilizationAndErrorAccumulator#fetchValue - Considering empty market as 0% utilization", function () {
    var sbOracle;
    var accumulator;

    beforeEach(async function () {
        const sbOracleStubFactory = await ethers.getContractFactory("MockOracle");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AdrastiaUtilizationAndErrorAccumulatorStub");

        sbOracle = await sbOracleStubFactory.deploy(AddressZero);
        await sbOracle.deployed();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            sbOracle.address,
            false,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await accumulator.deployed();
    });

    it("Returns 0% utilization when the market is at zero utilization but has no liquidity", async function () {
        await sbOracle.stubSetObservationNow(USDC, 0, 0, 0);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits("0", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 0% utilization when the market is at zero utilization but has liquidity", async function () {
        const totalBorrow = 0;
        const totalSupply = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits("0", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 1% utilization when the market is at 1% utilization", async function () {
        const totalBorrow = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);
        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits("0.01", DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 50% utilization when the market is at 50% utilization", async function () {
        const utilizationStr = "0.5";

        const totalBorrow = ethers.utils.parseUnits("50", DEFAULT_DECIMALS);
        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns target utilization when the market is at target utilization", async function () {
        const utilizationStr = ethers.utils.formatUnits(DEFAULT_TARGET, DEFAULT_DECIMALS);

        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = DEFAULT_TARGET.mul(totalSupply).div(BigNumber.from(10).pow(DEFAULT_DECIMALS));
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });

    it("Returns 100% utilization when the market is at 100% utilization", async function () {
        const utilizationStr = "1";

        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = totalSupply;
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        const utilization = await accumulator.stubFetchValue(USDC);
        const expectedUtilization = ethers.utils.parseUnits(utilizationStr, DEFAULT_DECIMALS);

        expect(utilization).to.eq(expectedUtilization);
    });
});

describe("AdrastiaUtilizationAndErrorAccumulator#fetchLiquidity", function () {
    var sbOracle;
    var accumulator;

    beforeEach(async function () {
        const sbOracleStubFactory = await ethers.getContractFactory("MockOracle");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AdrastiaUtilizationAndErrorAccumulatorStub");

        sbOracle = await sbOracleStubFactory.deploy(AddressZero);
        await sbOracle.deployed();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            sbOracle.address,
            true,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await accumulator.deployed();
    });

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
            "when the market is at zero utilization but has no liquidity",
        async function () {
            const totalBorrow = 0;
            const totalSupply = 0;
            await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

            const [utilization, error] = await accumulator.stubFetchLiquidity(USDC);
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
            "when the market is at zero utilization and has liquidity",
        async function () {
            const totalBorrow = 0;
            const totalSupply = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);
            await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

            const [utilization, error] = await accumulator.stubFetchLiquidity(USDC);
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
            "when the market is at that utilization",
        async function () {
            const utilizationStr = "0.01";

            const totalBorrow = ethers.utils.parseUnits("1", DEFAULT_DECIMALS);
            const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
            await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

            const [utilization, error] = await accumulator.stubFetchLiquidity(USDC);
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
            "when the market is at that utilization",
        async function () {
            const utilizationStr = "0.5";

            const totalBorrow = ethers.utils.parseUnits("50", DEFAULT_DECIMALS);
            const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
            await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

            const [utilization, error] = await accumulator.stubFetchLiquidity(USDC);
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
            "when the market is at that utilization",
        async function () {
            const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
            const totalBorrow = DEFAULT_TARGET.mul(totalSupply).div(BigNumber.from(10).pow(DEFAULT_DECIMALS));
            await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

            const [utilization, error] = await accumulator.stubFetchLiquidity(USDC);
            const expectedUtilization = DEFAULT_TARGET;

            expect(utilization).to.eq(expectedUtilization);
            expect(error).to.eq(ERROR_TARGET);
        }
    );
});

describe("AdrastiaUtilizationAndErrorAccumulator#consultLiquidity(token,maxAge=0)", function () {
    var sbOracle;
    var accumulator;

    beforeEach(async function () {
        const sbOracleStubFactory = await ethers.getContractFactory("MockOracle");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AdrastiaUtilizationAndErrorAccumulatorStub");

        sbOracle = await sbOracleStubFactory.deploy(AddressZero);
        await sbOracle.deployed();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            sbOracle.address,
            true,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await accumulator.deployed();
    });

    it("Retrieves the instant utilization and error", async function () {
        await timeAndMine.setTimeIncrease(1);

        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = ethers.utils.parseUnits("90", DEFAULT_DECIMALS);
        await sbOracle.stubSetInstantRates(USDC, 0, totalBorrow, totalSupply);

        // Consult the liquidity
        const [utilization, error] = await accumulator["consultLiquidity(address,uint256)"](USDC, 0);

        // Calculate expected values
        const expectedUtilization = totalBorrow.mul(BigNumber.from(10).pow(DEFAULT_DECIMALS)).div(totalSupply);
        const expectedError = calculateError(expectedUtilization, DEFAULT_TARGET);

        expect(utilization).to.equal(expectedUtilization);
        expect(error).to.equal(expectedError);
    });
});

describe("AdrastiaUtilizationAndErrorAccumulator#update", function () {
    var sbOracle;
    var accumulator;

    beforeEach(async function () {
        const sbOracleStubFactory = await ethers.getContractFactory("MockOracle");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("AdrastiaUtilizationAndErrorAccumulator");

        sbOracle = await sbOracleStubFactory.deploy(AddressZero);
        await sbOracle.deployed();
        const averagingStrategy = await averagingStrategyFactory.deploy();
        accumulator = await accumulatorFactory.deploy(
            sbOracle.address,
            true,
            DEFAULT_TARGET,
            averagingStrategy.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        await accumulator.deployed();
    });

    it("Updates successfully", async function () {
        // Set the SB oracle observation
        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = ethers.utils.parseUnits("90", DEFAULT_DECIMALS);
        await sbOracle.stubSetObservationNow(USDC, 0, totalBorrow, totalSupply);

        // Update the accumulator
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        const updateTx = await accumulator.update(updateData);

        // Wait for the transaction to be mined
        const updateReceipt = await updateTx.wait();

        // Get the mined block number
        const blockNumber = updateReceipt.blockNumber;
        const timestamp = await blockTimestamp(blockNumber);

        // Calculate the expected utilization
        const expectedUtilization = totalBorrow.mul(BigNumber.from(10).pow(DEFAULT_DECIMALS)).div(totalSupply);
        // Calculate the expected error
        const expectedError = calculateError(expectedUtilization, DEFAULT_TARGET);

        // Ensure that the Updated event was emitted
        await expect(updateTx)
            .to.emit(accumulator, "Updated")
            .withArgs(USDC, expectedUtilization, expectedError, timestamp);
    });

    it("Updates successfully when the underlying observation is just fresh enough", async function () {
        await timeAndMine.setTimeIncrease(1);

        // Set the SB oracle observation
        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = ethers.utils.parseUnits("90", DEFAULT_DECIMALS);
        // The observation will be DEFAULT_HEARTBEAT seconds old when update is called
        const oTimestamp = (await currentBlockTimestamp()) - DEFAULT_HEARTBEAT + 2;
        await sbOracle.stubSetObservation(USDC, 0, totalBorrow, totalSupply, oTimestamp);

        // Update the accumulator
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        const updateTx = await accumulator.update(updateData);

        // Wait for the transaction to be mined
        const updateReceipt = await updateTx.wait();

        // Get the mined block number
        const blockNumber = updateReceipt.blockNumber;
        const timestamp = await blockTimestamp(blockNumber);

        // Calculate the expected utilization
        const expectedUtilization = totalBorrow.mul(BigNumber.from(10).pow(DEFAULT_DECIMALS)).div(totalSupply);
        // Calculate the expected error
        const expectedError = calculateError(expectedUtilization, DEFAULT_TARGET);

        // Ensure that the Updated event was emitted
        await expect(updateTx)
            .to.emit(accumulator, "Updated")
            .withArgs(USDC, expectedUtilization, expectedError, timestamp);
    });

    it("Reverts when the underlying observation is too old", async function () {
        await timeAndMine.setTimeIncrease(1);

        // Set the SB oracle observation
        const totalSupply = ethers.utils.parseUnits("100", DEFAULT_DECIMALS);
        const totalBorrow = ethers.utils.parseUnits("90", DEFAULT_DECIMALS);
        // The observation will be DEFAULT_HEARTBEAT + 1 seconds old when update is called
        const oTimestamp = (await currentBlockTimestamp()) - DEFAULT_HEARTBEAT + 1;
        await sbOracle.stubSetObservation(USDC, 0, totalBorrow, totalSupply, oTimestamp);

        // Update the accumulator
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        await expect(accumulator.update(updateData)).to.be.revertedWith("AbstractOracle: RATE_TOO_OLD");
    });
});
