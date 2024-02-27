const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const DEFAULT_PRECISION_DECIMALS = 8;
const DEFAULT_UPDATE_THRESHOLD = ethers.utils.parseUnits("0.02", DEFAULT_PRECISION_DECIMALS); // 2%
const DEFAULT_UPDATE_DELAY = 10;
const DEFAULT_HEARTBEAT = 8 * 60 * 60;

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function createDefaultDeployment(overrides, contractName = "AdrastiaPriceAccumulatorStub") {
    var aggregationStrategyAddress = overrides?.aggregationStrategyAddress;
    if (!aggregationStrategyAddress) {
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();

        aggregationStrategyAddress = averagingStrategy.address;
    }

    var quoteToken = overrides?.quoteToken || USDC;

    var oracleAddress = overrides?.oracleAddress;
    var oracle;
    if (!oracleAddress) {
        const oracleFactory = await ethers.getContractFactory("MockOracle");
        oracle = await oracleFactory.deploy(quoteToken);
        await oracle.deployed();

        oracleAddress = oracle.address;
    }

    var updateThreshold = overrides?.updateThreshold ?? DEFAULT_UPDATE_THRESHOLD;
    var minUpdateDelay = overrides?.minUpdateDelay ?? DEFAULT_UPDATE_DELAY;
    var maxUpdateDelay = overrides?.maxUpdateDelay ?? DEFAULT_HEARTBEAT;

    const factory = await ethers.getContractFactory(contractName);

    const accumulator = await factory.deploy(
        aggregationStrategyAddress,
        oracleAddress,
        updateThreshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    return {
        accumulator: accumulator,
        averagingStrategy: aggregationStrategyAddress,
        quoteToken: quoteToken,
        updateThreshold: updateThreshold,
        updateDelay: minUpdateDelay,
        heartbeat: maxUpdateDelay,
        oracle: oracle,
    };
}

describe("AdrastiaPriceAccumulator#constructor", function () {
    it("Deploys correctly with defaults", async function () {
        const { accumulator, averagingStrategy, quoteToken, updateThreshold, updateDelay, heartbeat } =
            await createDefaultDeployment();

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy);
        expect(await accumulator.quoteToken()).to.equal(quoteToken);

        expect(await accumulator.updateThreshold()).to.equal(updateThreshold);
        expect(await accumulator.updateDelay()).to.equal(updateDelay);
        expect(await accumulator.heartbeat()).to.equal(heartbeat);
    });
});

describe("AdrastiaPriceAccumulator#quoteTokenName", function () {
    const tokenNames = ["USD Coin", "Wrapped Ether"];

    for (const tokenName of tokenNames) {
        it(`Returns the correct name for ${tokenName}`, async function () {
            const tokenFactory = await ethers.getContractFactory("NotAnErc20");

            const token = await tokenFactory.deploy(tokenName, "SYMBOL", 18);
            await token.deployed();

            const { accumulator } = await createDefaultDeployment({ quoteToken: token.address });

            expect(await accumulator.quoteTokenName()).to.equal(tokenName);
        });
    }
});

describe("AdrastiaPriceAccumulator#quoteTokenSymbol", function () {
    const tokenSymbols = ["USDC", "WETH"];

    for (const tokenSymbol of tokenSymbols) {
        it(`Returns the correct symbol for ${tokenSymbol}`, async function () {
            const tokenFactory = await ethers.getContractFactory("NotAnErc20");

            const token = await tokenFactory.deploy("USD Coin", tokenSymbol, 18);
            await token.deployed();

            const { accumulator } = await createDefaultDeployment({ quoteToken: token.address });

            expect(await accumulator.quoteTokenSymbol()).to.equal(tokenSymbol);
        });
    }
});

describe("AdrastiaPriceAccumulator#quoteTokenDecimals", function () {
    const tokenDecimalss = [0, 1, 6, 8, 18];

    for (const tokenDecimals of tokenDecimalss) {
        it(`Returns the correct decimals for ${tokenDecimals}`, async function () {
            const tokenFactory = await ethers.getContractFactory("NotAnErc20");

            const token = await tokenFactory.deploy("USD Coin", "USDC", tokenDecimals);
            await token.deployed();

            const { accumulator } = await createDefaultDeployment({ quoteToken: token.address });

            expect(await accumulator.quoteTokenDecimals()).to.equal(tokenDecimals);
        });
    }
});

describe("AdrastiaPriceAccumulator#canUpdate", function () {
    var deployment;

    beforeEach(async function () {
        deployment = await createDefaultDeployment();
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the underlying oracle's observation is old (age=heartbeat+2)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 2);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the underlying oracle's observation is old (age=heartbeat+1)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 1);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=heartbeat)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=heartbeat-1)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat - 1);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=0)", async function () {
        const timestamp = (await currentBlockTimestamp()) + 100;
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=1)", async function () {
        const timestamp = (await currentBlockTimestamp()) + 100;
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + 1);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });
});

describe("AdrastiaPriceAccumulator#fetchPrice", function () {
    var deployment;

    beforeEach(async function () {
        deployment = await createDefaultDeployment();
    });

    it("Returns the correct price", async function () {
        const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

        const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);
        const token = GRT;

        const timestamp = await currentBlockTimestamp();

        // Set the price
        await deployment.oracle.stubSetObservation(token, price, 3, 5, timestamp);

        expect(await deployment.accumulator.stubFetchPrice(token)).to.equal(price);
    });

    it("Reverts if the underlying oracle's observation is old (age=heartbeat+2)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 2);

        await expect(deployment.accumulator.stubFetchPrice(token)).to.be.revertedWith("AbstractOracle: RATE_TOO_OLD");
    });

    it("Reverts if the underlying oracle's observation is old (age=heartbeat+1)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        // Set the observation
        await deployment.oracle.stubSetObservation(token, 2, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 1);

        await expect(deployment.accumulator.stubFetchPrice(token)).to.be.revertedWith("AbstractOracle: RATE_TOO_OLD");
    });

    it("Returns the correct price if the underlying oracle's observation is fresh (age=heartbeat)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        const price = ethers.utils.parseUnits("1.23", await deployment.accumulator.quoteTokenDecimals());

        // Set the observation
        await deployment.oracle.stubSetObservation(token, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat);

        expect(await deployment.accumulator.stubFetchPrice(token)).to.equal(price);
    });

    it("Returns the correct price if the underlying oracle's observation is fresh (age=heartbeat-1)", async function () {
        const timestamp = await currentBlockTimestamp();
        const token = GRT;

        const price = ethers.utils.parseUnits("1.23", await deployment.accumulator.quoteTokenDecimals());

        // Set the observation
        await deployment.oracle.stubSetObservation(token, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat - 1);

        expect(await deployment.accumulator.stubFetchPrice(token)).to.equal(price);
    });

    it("Returns the correct price if the underlying oracle's observation is fresh (age=0)", async function () {
        const timestamp = (await currentBlockTimestamp()) + 100;
        const token = GRT;

        const price = ethers.utils.parseUnits("1.23", await deployment.accumulator.quoteTokenDecimals());

        // Set the observation
        await deployment.oracle.stubSetObservation(token, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp);

        expect(await deployment.accumulator.stubFetchPrice(token)).to.equal(price);
    });

    it("Returns the correct price if the underlying oracle's observation is fresh (age=1)", async function () {
        const timestamp = (await currentBlockTimestamp()) + 100;
        const token = GRT;

        const price = ethers.utils.parseUnits("1.23", await deployment.accumulator.quoteTokenDecimals());

        // Set the observation
        await deployment.oracle.stubSetObservation(token, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + 1);

        expect(await deployment.accumulator.stubFetchPrice(token)).to.equal(price);
    });
});
