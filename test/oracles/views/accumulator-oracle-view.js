const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const ZERO_ACCUMULATION = [BigNumber.from(0), 0];

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60 * 60; // At most (optimistically) 1 hour between every update

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function createDefaultOracle(quoteToken, contractName = "AccumulatorOracleView") {
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const liquidityAccumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
    const liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
        averagingStrategy.address,
        quoteToken,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );
    await liquidityAccumulator.deployed();

    const priceAccumulatorFactory = await ethers.getContractFactory("PriceAccumulatorStub");
    const priceAccumulator = await priceAccumulatorFactory.deploy(
        averagingStrategy.address,
        quoteToken,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );
    await priceAccumulator.deployed();

    const factory = await ethers.getContractFactory(contractName);
    const oracle = await factory.deploy(liquidityAccumulator.address, priceAccumulator.address, quoteToken);

    return {
        liquidityAccumulator: liquidityAccumulator,
        priceAccumulator: priceAccumulator,
        oracle: oracle,
    };
}

async function createDefaultOracleStub(quoteToken, contractName = "AccumulatorOracleViewStub") {
    return await createDefaultOracle(liquidityAccumulator, priceAccumulator, quoteToken, contractName);
}

describe("AccumulatorOracleView#constructor", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Deploys correctly", async function () {
        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityAccumulator()).to.equal(liquidityAccumulator.address);
        expect(await oracle.priceAccumulator()).to.equal(priceAccumulator.address);
        expect(await oracle.liquidityDecimals()).to.equal(await liquidityAccumulator.liquidityDecimals());
    });
});

describe("AccumulatorOracleView#canUpdate", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;

        // Make the accumulators seem up-to-date for GRT
        await liquidityAccumulator.stubPushAccumulation(GRT, 2, 2);
        await liquidityAccumulator.stubPushObservation(GRT, 2, 2);
        await priceAccumulator.stubPushAccumulation(GRT, 2);
        await priceAccumulator.stubPushObservation(GRT, 2);
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await oracle.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await oracle.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false even if the token address is valid", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await oracle.canUpdate(updateData)).to.equal(false);
    });
});

describe("AccumulatorOracleView#needsUpdate", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;

        // Make the accumulators seem up-to-date for GRT
        await liquidityAccumulator.stubPushAccumulation(GRT, 2, 2);
        await liquidityAccumulator.stubPushObservation(GRT, 2, 2);
        await priceAccumulator.stubPushAccumulation(GRT, 2);
        await priceAccumulator.stubPushObservation(GRT, 2);
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await oracle.needsUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await oracle.needsUpdate(updateData)).to.equal(false);
    });

    it("Returns false even if the token address is valid", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await oracle.needsUpdate(updateData)).to.equal(false);
    });
});

describe("AccumulatorOracleView#update", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;

        // Make the accumulators seem up-to-date for GRT
        await liquidityAccumulator.stubPushAccumulation(GRT, 2, 2);
        await liquidityAccumulator.stubPushObservation(GRT, 2, 2);
        await priceAccumulator.stubPushAccumulation(GRT, 2);
        await priceAccumulator.stubPushObservation(GRT, 2);
    });

    async function expectNoUpdates(updateData) {
        expect(await oracle.callStatic.update(updateData)).to.equal(false);

        const tx = await oracle.update(updateData);
        const receipt = await tx.wait();

        expect(receipt.events).to.be.empty;
    }

    it("Doesn't update if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        await expectNoUpdates(updateData);
    });

    it("Doesn't update if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        await expectNoUpdates(updateData);
    });

    it("Doesn't update even if the token address is valid", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        await expectNoUpdates(updateData);
    });
});

describe("AccumulatorOracleView#getLatestObservation", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Reverts if neither accumulator has an observation", async function () {
        await expect(oracle.getLatestObservation(GRT)).to.be.reverted;
    });

    it("Reverts if the price accumulator doesn't have an observation", async function () {
        await liquidityAccumulator.stubPushAccumulation(GRT, 2, 2);
        await liquidityAccumulator.stubPushObservation(GRT, 2, 2);

        await expect(oracle.getLatestObservation(GRT)).to.be.reverted;

        // Sanity check that it doesn't revert if the price accumulator has an observation
        await priceAccumulator.stubPushAccumulation(GRT, 2);
        await priceAccumulator.stubPushObservation(GRT, 2);
        await expect(oracle.getLatestObservation(GRT)).to.not.be.reverted;
    });

    it("Reverts if the liquidity accumulator doesn't have an observation", async function () {
        await priceAccumulator.stubPushAccumulation(GRT, 2);
        await priceAccumulator.stubPushObservation(GRT, 2);

        await expect(oracle.getLatestObservation(GRT)).to.be.reverted;

        // Sanity check that it doesn't revert if the liquidity accumulator has an observation
        await liquidityAccumulator.stubPushAccumulation(GRT, 2, 2);
        await liquidityAccumulator.stubPushObservation(GRT, 2, 2);
        await expect(oracle.getLatestObservation(GRT)).to.not.be.reverted;
    });

    it("Returns the older timestamp with that being from the price accumulator", async function () {
        const currentTime = await currentBlockTimestamp();
        const priceAccumulatorTimestamp = currentTime - 200;
        const liquidityAccumulatorTimestamp = currentTime - 100;

        await priceAccumulator.stubSetAccumulation(GRT, 2, priceAccumulatorTimestamp);
        await priceAccumulator.stubSetObservation(GRT, 2, priceAccumulatorTimestamp);

        await liquidityAccumulator.stubSetAccumulation(GRT, 2, 2, liquidityAccumulatorTimestamp);
        await liquidityAccumulator.stubSetObservation(GRT, 2, 2, liquidityAccumulatorTimestamp);

        const observation = await oracle.getLatestObservation(GRT);
        expect(observation.timestamp).to.equal(priceAccumulatorTimestamp);
    });

    it("Returns the older timestamp with that being from the liquidity accumulator", async function () {
        const currentTime = await currentBlockTimestamp();
        const priceAccumulatorTimestamp = currentTime - 100;
        const liquidityAccumulatorTimestamp = currentTime - 200;

        await priceAccumulator.stubSetAccumulation(GRT, 2, priceAccumulatorTimestamp);
        await priceAccumulator.stubSetObservation(GRT, 2, priceAccumulatorTimestamp);

        await liquidityAccumulator.stubSetAccumulation(GRT, 2, 2, liquidityAccumulatorTimestamp);
        await liquidityAccumulator.stubSetObservation(GRT, 2, 2, liquidityAccumulatorTimestamp);

        const observation = await oracle.getLatestObservation(GRT);
        expect(observation.timestamp).to.equal(liquidityAccumulatorTimestamp);
    });

    it("Returns the correct price and liquidity", async function () {
        const price = 2;
        const tokenLiquidity = 3;
        const quoteTokenLiquidity = 5;

        await priceAccumulator.stubPushAccumulation(GRT, price);
        await priceAccumulator.stubPushObservation(GRT, price);

        await liquidityAccumulator.stubPushAccumulation(GRT, tokenLiquidity, quoteTokenLiquidity);
        await liquidityAccumulator.stubPushObservation(GRT, tokenLiquidity, quoteTokenLiquidity);

        const observation = await oracle.getLatestObservation(GRT);
        expect(observation.price).to.equal(price);
        expect(observation.tokenLiquidity).to.equal(tokenLiquidity);
        expect(observation.quoteTokenLiquidity).to.equal(quoteTokenLiquidity);
    });
});

describe("AccumulatorOracleView#consultPrice(token, maxAge = 0)", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Returns the instant price", async function () {
        const observedPrice = 2;
        await priceAccumulator.stubPushAccumulation(GRT, observedPrice);
        await priceAccumulator.stubPushObservation(GRT, observedPrice);

        const observedTokenLiquidity = 2;
        const observedQuoteTokenLiquidity = 3;
        await liquidityAccumulator.stubPushAccumulation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);
        await liquidityAccumulator.stubPushObservation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);

        const instantPrice = 5;
        await priceAccumulator.setPrice(GRT, instantPrice);

        expect(await oracle["consultPrice(address,uint256)"](GRT, 0)).to.equal(instantPrice);
    });
});

describe("AccumulatorOracleView#consultLiquidity(token, maxAge = 0)", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Returns the instant liquidity", async function () {
        const observedPrice = 2;
        await priceAccumulator.stubPushAccumulation(GRT, observedPrice);
        await priceAccumulator.stubPushObservation(GRT, observedPrice);

        const observedTokenLiquidity = 2;
        const observedQuoteTokenLiquidity = 3;
        await liquidityAccumulator.stubPushAccumulation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);
        await liquidityAccumulator.stubPushObservation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);

        const instantTokenLiquidity = BigNumber.from(5);
        const instantQuoteTokenLiquidity = BigNumber.from(7);
        await liquidityAccumulator.setLiquidity(GRT, instantTokenLiquidity, instantQuoteTokenLiquidity);

        expect(await oracle["consultLiquidity(address,uint256)"](GRT, 0)).to.deep.equal([
            instantTokenLiquidity,
            instantQuoteTokenLiquidity,
        ]);
    });
});

describe("AccumulatorOracleView#consultPrice(token)", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Returns the observed price", async function () {
        const observedPrice = 2;
        await priceAccumulator.stubPushAccumulation(GRT, observedPrice);
        await priceAccumulator.stubPushObservation(GRT, observedPrice);

        const observedTokenLiquidity = BigNumber.from(2);
        const observedQuoteTokenLiquidity = BigNumber.from(3);
        await liquidityAccumulator.stubPushAccumulation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);
        await liquidityAccumulator.stubPushObservation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);

        const instantPrice = 5;
        await priceAccumulator.setPrice(GRT, instantPrice);

        expect(await oracle["consultPrice(address)"](GRT)).to.equal(observedPrice);
    });
});

describe("AccumulatorOracleView#consultLiquidity(token)", function () {
    var liquidityAccumulator;
    var priceAccumulator;
    var quoteToken;
    var oracle;

    beforeEach(async function () {
        quoteToken = USDC;
        const deployment = await createDefaultOracle(quoteToken);
        liquidityAccumulator = deployment.liquidityAccumulator;
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Returns the observed liquidity", async function () {
        const observedPrice = 2;
        await priceAccumulator.stubPushAccumulation(GRT, observedPrice);
        await priceAccumulator.stubPushObservation(GRT, observedPrice);

        const observedTokenLiquidity = BigNumber.from(2);
        const observedQuoteTokenLiquidity = BigNumber.from(3);
        await liquidityAccumulator.stubPushAccumulation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);
        await liquidityAccumulator.stubPushObservation(GRT, observedTokenLiquidity, observedQuoteTokenLiquidity);

        const instantTokenLiquidity = BigNumber.from(5);
        const instantQuoteTokenLiquidity = BigNumber.from(7);
        await liquidityAccumulator.setLiquidity(GRT, instantTokenLiquidity, instantQuoteTokenLiquidity);

        expect(await oracle["consultLiquidity(address)"](GRT)).to.deep.equal([
            observedTokenLiquidity,
            observedQuoteTokenLiquidity,
        ]);
    });
});

describe("AccumulatorOracleView#supportsInterface", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async function () {
        const deployment = await createDefaultOracle(USDC);
        oracle = deployment.oracle;
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IOracle", async () => {
        const interfaceId = await interfaceIds.iOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IPriceOracle", async () => {
        const interfaceId = await interfaceIds.iPriceOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support ILiquidityOracle", async () => {
        const interfaceId = await interfaceIds.iLiquidityOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IQuoteToken", async () => {
        const interfaceId = await interfaceIds.iQuoteToken();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IUpdateable", async () => {
        const interfaceId = await interfaceIds.iUpdateable();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHasLiquidityAccumulator", async () => {
        const interfaceId = await interfaceIds.iHasLiquidityAccumulator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHasPriceAccumulator", async () => {
        const interfaceId = await interfaceIds.iHasPriceAccumulator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
