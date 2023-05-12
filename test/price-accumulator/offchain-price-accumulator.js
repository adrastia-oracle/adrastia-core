const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60; // At most (optimistically) 60 seconds between every update

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function createDefaultAccumulator(averagingStrategy, quoteToken, contractName = "OffchainPriceAccumulator") {
    const factory = await ethers.getContractFactory(contractName);

    const accumulator = await factory.deploy(
        averagingStrategy.address,
        quoteToken,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );

    return accumulator;
}

async function createDefaultAccumulatorStub(
    averagingStrategy,
    quoteToken,
    contractName = "OffchainPriceAccumulatorStub"
) {
    return await createDefaultAccumulator(averagingStrategy, quoteToken, contractName);
}

describe("OffchainPriceAccumulator#constructor", function () {
    var accumulator;
    var averagingStrategy;
    var quoteToken;

    beforeEach(async function () {
        const averagingStrategyFactory = await ethers.getContractFactory("GeometricAveraging");
        averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();
        quoteToken = USDC;

        accumulator = await createDefaultAccumulator(averagingStrategy, quoteToken);
    });

    it("Deploys correctly", async function () {
        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.quoteToken()).to.equal(quoteToken);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
    });
});

describe("OffchainPriceAccumulator#canUpdate", function () {
    var accumulator;
    var averagingStrategy;
    var quoteToken;

    beforeEach(async function () {
        const averagingStrategyFactory = await ethers.getContractFactory("GeometricAveraging");
        averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();
        quoteToken = USDC;

        accumulator = await createDefaultAccumulatorStub(averagingStrategy, quoteToken);
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await accumulator.canUpdate(updateData)).to.equal(false);

        // Sanity check that it works with a non-zero address
        updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await accumulator.canUpdate(updateData)).to.equal(true);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await accumulator.canUpdate(updateData)).to.equal(false);

        // Sanity check that it works with a non-zero address
        updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await accumulator.canUpdate(updateData)).to.equal(true);
    });
});

describe("OffchainPriceAccumulator#validateObservation", function () {
    var accumulator;
    var averagingStrategy;
    var quoteToken;

    beforeEach(async function () {
        const averagingStrategyFactory = await ethers.getContractFactory("GeometricAveraging");
        averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();
        quoteToken = USDC;

        accumulator = await createDefaultAccumulatorStub(averagingStrategy, quoteToken);
    });

    it("Fails validation if the timestamp fails validation", async function () {
        await accumulator.overrideValidateObservationTime(true, false);

        const token = GRT;
        const price = BigNumber.from(2);
        const timestamp = 3;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"],
            [token, price, timestamp]
        );
        expect(await accumulator.callStatic.stubValidateObservation(updateData, price)).to.equal(false);
        const tx = await accumulator.stubValidateObservation(updateData, price);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(token, price, price, blockTime, timestamp, false);
    });

    it("Passes validation if the timestamp fails validation", async function () {
        await accumulator.overrideValidateObservationTime(true, true);

        const token = GRT;
        const price = BigNumber.from(2);
        const timestamp = await currentBlockTimestamp();

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"],
            [token, price, timestamp]
        );
        expect(await accumulator.callStatic.stubValidateObservation(updateData, price)).to.equal(true);
        const tx = await accumulator.stubValidateObservation(updateData, price);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(token, price, price, blockTime, timestamp, true);
    });
});

describe("OffchainPriceAccumulator#update", function () {
    var accumulator;
    var averagingStrategy;
    var quoteToken;

    beforeEach(async function () {
        const averagingStrategyFactory = await ethers.getContractFactory("GeometricAveraging");
        averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();
        quoteToken = USDC;

        accumulator = await createDefaultAccumulatorStub(averagingStrategy, quoteToken);
    });

    it("Successfully updates with a valid price and a recent timestamp", async function () {
        const token = GRT;
        const price = BigNumber.from(2);
        const timestamp = await currentBlockTimestamp();

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"],
            [token, price, timestamp]
        );
        expect(await accumulator.callStatic.update(updateData)).to.equal(true);
        const tx = await accumulator.update(updateData);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the ValidationPerformed event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(token, price, price, blockTime, timestamp, true);

        // Expect the Updated event to be emitted
        await expect(tx).to.emit(accumulator, "Updated").withArgs(token, price, blockTime);
    });

    it("Doesn't update with a valid price, but with timestamp=0", async function () {
        const token = GRT;
        const price = BigNumber.from(2);
        const timestamp = 0;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"],
            [token, price, timestamp]
        );
        expect(await accumulator.callStatic.update(updateData)).to.equal(false);
        const tx = await accumulator.update(updateData);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the ValidationPerformed event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(token, price, price, blockTime, timestamp, false);

        // Expect the Updated event to be emitted
        await expect(tx).to.not.emit(accumulator, "Updated");
    });

    it("Doesn't update with a valid price, but with timestamp=3", async function () {
        const token = GRT;
        const price = BigNumber.from(2);
        const timestamp = 3;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"],
            [token, price, timestamp]
        );
        expect(await accumulator.callStatic.update(updateData)).to.equal(false);
        const tx = await accumulator.update(updateData);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the ValidationPerformed event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(token, price, price, blockTime, timestamp, false);

        // Expect the Updated event to be emitted
        await expect(tx).to.not.emit(accumulator, "Updated");
    });

    it("Doesn't update with a recent timestamp, but with a price that exceeds the max", async function () {
        const token = GRT;
        const price = BigNumber.from(2).pow(120); // exceeds type(uint112).max
        const timestamp = await currentBlockTimestamp();

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"],
            [token, price, timestamp]
        );
        await expect(accumulator.update(updateData)).to.be.reverted;
    });

    it("Doesn't update with timestamp=3 and a price that exceeds the max", async function () {
        const token = GRT;
        const price = BigNumber.from(2).pow(120); // exceeds type(uint112).max
        const timestamp = 3;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256"],
            [token, price, timestamp]
        );
        await expect(accumulator.update(updateData)).to.be.reverted;
    });
});
