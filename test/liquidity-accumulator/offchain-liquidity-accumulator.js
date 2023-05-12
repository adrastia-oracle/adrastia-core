const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const DEFAULT_DECIMALS = 0;
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

async function createDefaultAccumulator(averagingStrategy, quoteToken, contractName = "OffchainLiquidityAccumulator") {
    const factory = await ethers.getContractFactory(contractName);

    const accumulator = await factory.deploy(
        averagingStrategy.address,
        quoteToken,
        DEFAULT_DECIMALS,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );

    return accumulator;
}

async function createDefaultAccumulatorStub(
    averagingStrategy,
    quoteToken,
    contractName = "OffchainLiquidityAccumulatorStub"
) {
    return await createDefaultAccumulator(averagingStrategy, quoteToken, contractName);
}

describe("OffchainLiquidityAccumulator#constructor", function () {
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
        expect(await accumulator.liquidityDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await accumulator.quoteTokenDecimals()).to.equal(DEFAULT_DECIMALS);
    });
});

describe("OffchainLiquidityAccumulator#canUpdate", function () {
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

describe("OffchainLiquidityAccumulator#validateObservation", function () {
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
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(5);
        const timestamp = 3;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        expect(
            await accumulator.callStatic.stubValidateObservation(updateData, tokenLiquidity, quoteTokenLiquidity)
        ).to.equal(false);
        const tx = await accumulator.stubValidateObservation(updateData, tokenLiquidity, quoteTokenLiquidity);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(
                token,
                tokenLiquidity,
                tokenLiquidity,
                quoteTokenLiquidity,
                quoteTokenLiquidity,
                blockTime,
                timestamp,
                false
            );
    });

    it("Passes validation if the timestamp fails validation", async function () {
        await accumulator.overrideValidateObservationTime(true, true);

        const token = GRT;
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(5);
        const timestamp = await currentBlockTimestamp();

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        expect(
            await accumulator.callStatic.stubValidateObservation(updateData, tokenLiquidity, quoteTokenLiquidity)
        ).to.equal(true);
        const tx = await accumulator.stubValidateObservation(updateData, tokenLiquidity, quoteTokenLiquidity);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(
                token,
                tokenLiquidity,
                tokenLiquidity,
                quoteTokenLiquidity,
                quoteTokenLiquidity,
                blockTime,
                timestamp,
                true
            );
    });
});

describe("OffchainLiquidityAccumulator#update", function () {
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

    it("Successfully updates with valid liquidities and a recent timestamp", async function () {
        const token = GRT;
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(5);
        const timestamp = await currentBlockTimestamp();

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        expect(await accumulator.callStatic.update(updateData)).to.equal(true);
        const tx = await accumulator.update(updateData);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the ValidationPerformed event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(
                token,
                tokenLiquidity,
                tokenLiquidity,
                quoteTokenLiquidity,
                quoteTokenLiquidity,
                blockTime,
                timestamp,
                true
            );

        // Expect the Updated event to be emitted
        await expect(tx)
            .to.emit(accumulator, "Updated")
            .withArgs(token, tokenLiquidity, quoteTokenLiquidity, blockTime);
    });

    it("Doesn't update with valid liquidities, but with timestamp=0", async function () {
        const token = GRT;
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(5);
        const timestamp = 0;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        expect(await accumulator.callStatic.update(updateData)).to.equal(false);
        const tx = await accumulator.update(updateData);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the ValidationPerformed event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(
                token,
                tokenLiquidity,
                tokenLiquidity,
                quoteTokenLiquidity,
                quoteTokenLiquidity,
                blockTime,
                timestamp,
                false
            );

        // Expect the Updated event to be emitted
        await expect(tx).to.not.emit(accumulator, "Updated");
    });

    it("Doesn't update with valid liquidities, but with timestamp=3", async function () {
        const token = GRT;
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(5);
        const timestamp = 3;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        expect(await accumulator.callStatic.update(updateData)).to.equal(false);
        const tx = await accumulator.update(updateData);
        const receipt = await tx.wait();
        const blockTime = await blockTimestamp(receipt.blockNumber);

        // Expect the ValidationPerformed event to be emitted
        await expect(tx)
            .to.emit(accumulator, "ValidationPerformed")
            .withArgs(
                token,
                tokenLiquidity,
                tokenLiquidity,
                quoteTokenLiquidity,
                quoteTokenLiquidity,
                blockTime,
                timestamp,
                false
            );

        // Expect the Updated event to be emitted
        await expect(tx).to.not.emit(accumulator, "Updated");
    });

    it("Doesn't update with a recent timestamp, but with a token liquidity that exceeds the max", async function () {
        const token = GRT;
        const tokenLiquidity = BigNumber.from(2).pow(120); // exceeds type(uint112).max
        const quoteTokenLiquidity = BigNumber.from(5);
        const timestamp = await currentBlockTimestamp();

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        await expect(accumulator.update(updateData)).to.be.reverted;
    });

    it("Doesn't update with timestamp=3 and a token liquidity that exceeds the max", async function () {
        const token = GRT;
        const tokenLiquidity = BigNumber.from(2).pow(120); // exceeds type(uint112).max
        const quoteTokenLiquidity = BigNumber.from(5);
        const timestamp = 3;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        await expect(accumulator.update(updateData)).to.be.reverted;
    });

    it("Doesn't update with a recent timestamp, but with a quote token liquidity that exceeds the max", async function () {
        const token = GRT;
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(2).pow(120); // exceeds type(uint112).max
        const timestamp = await currentBlockTimestamp();

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        await expect(accumulator.update(updateData)).to.be.reverted;
    });

    it("Doesn't update with timestamp=3 and a quote token liquidity that exceeds the max", async function () {
        const token = GRT;
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(2).pow(120); // exceeds type(uint112).max
        const timestamp = 3;

        var updateData = ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256", "uint256", "uint256"],
            [token, tokenLiquidity, quoteTokenLiquidity, timestamp]
        );
        await expect(accumulator.update(updateData)).to.be.reverted;
    });
});
