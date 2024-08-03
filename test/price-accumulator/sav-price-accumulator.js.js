const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { currentBlockTimestamp, blockTimestamp } = require("../../src/time");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const DEFAULT_PRECISION_DECIMALS = 8;
const DEFAULT_UPDATE_THRESHOLD = ethers.utils.parseUnits("0.02", DEFAULT_PRECISION_DECIMALS); // 2%
const DEFAULT_UPDATE_DELAY = 10;
const DEFAULT_HEARTBEAT = 8 * 60 * 60;

async function createDefaultDeployment(overrides, contractName = "SAVPriceAccumulatorStub") {
    var averagingStrategyAddress = overrides?.averagingStrategyAddress;
    if (!averagingStrategyAddress) {
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();

        averagingStrategyAddress = averagingStrategy.address;
    }

    var token = overrides?.token || GRT;

    var quoteToken = overrides?.quoteToken || USDC;

    var oracleAddress = overrides?.oracleAddress;
    var oracle;
    if (!oracleAddress) {
        const oracleFactory = await ethers.getContractFactory("MockOracle");
        oracle = await oracleFactory.deploy(quoteToken);
        await oracle.deployed();

        oracleAddress = oracle.address;
    }

    var vaultAddress = overrides?.vaultAddress;
    var vault;
    if (!vaultAddress) {
        const vaultFactory = await ethers.getContractFactory("MockVault");
        vault = await vaultFactory.deploy(token);
        await vault.deployed();
    }

    var updateThreshold = overrides?.updateThreshold ?? DEFAULT_UPDATE_THRESHOLD;
    var minUpdateDelay = overrides?.minUpdateDelay ?? DEFAULT_UPDATE_DELAY;
    var maxUpdateDelay = overrides?.maxUpdateDelay ?? DEFAULT_HEARTBEAT;

    const factory = await ethers.getContractFactory(contractName);

    const accumulator = await factory.deploy(
        oracleAddress,
        averagingStrategyAddress,
        quoteToken,
        updateThreshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    return {
        accumulator: accumulator,
        averagingStrategy: averagingStrategyAddress,
        quoteToken: quoteToken,
        updateThreshold: updateThreshold,
        updateDelay: minUpdateDelay,
        heartbeat: maxUpdateDelay,
        oracle: oracle,
        vault: vault,
    };
}

describe("SAVPriceAccumulator#constructor", function () {
    it("Deploys correctly with defaults", async function () {
        const { accumulator, averagingStrategy, quoteToken, updateThreshold, updateDelay, heartbeat, oracle } =
            await createDefaultDeployment();

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy);
        expect(await accumulator.quoteToken()).to.equal(quoteToken);

        expect(await accumulator.updateThreshold()).to.equal(updateThreshold);
        expect(await accumulator.updateDelay()).to.equal(updateDelay);
        expect(await accumulator.heartbeat()).to.equal(heartbeat);
        expect(await accumulator.underlyingAssetOracle()).to.equal(oracle.address);
    });

    it("Reverts if the averaging strategy address is zero", async function () {
        await expect(createDefaultDeployment({ averagingStrategyAddress: AddressZero })).to.be.revertedWith(
            "InvalidAveragingStrategy"
        );
    });

    it("Reverts if the quote token address is zero", async function () {
        await expect(createDefaultDeployment({ quoteToken: AddressZero })).to.be.revertedWith("InvalidQuoteToken");
    });

    it("Reverts if the oracle address is zero", async function () {
        await expect(createDefaultDeployment({ oracleAddress: AddressZero })).to.be.revertedWith("InvalidOracle");
    });
});

describe("SAVPriceAccumulator#quoteTokenName", function () {
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

describe("SAVPriceAccumulator#quoteTokenSymbol", function () {
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

describe("SAVPriceAccumulator#quoteTokenDecimals", function () {
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

describe("SAVPriceAccumulator#canUpdate", function () {
    var tokenFactory;

    var deployment;
    var quoteToken;
    var token;
    var signer;

    before(async function () {
        tokenFactory = await ethers.getContractFactory("FakeERC20");
        signer = (await ethers.getSigners())[0];
    });

    beforeEach(async function () {
        token = await tokenFactory.deploy("Token 1", "TK1", 18);
        await token.deployed();
        quoteToken = await tokenFactory.deploy("Token 2", "TK2", 18);
        await quoteToken.deployed();

        deployment = await createDefaultDeployment({
            token: token.address,
            quoteToken: quoteToken.address,
        });
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [quoteToken.address]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token is not a vault", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the underlying oracle's observation is old (age=heartbeat+2)", async function () {
        const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

        // Mint some tokens to the vault
        await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
        await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

        const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

        const timestamp = await currentBlockTimestamp();

        // Set the price
        await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 2);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [deployment.vault.address]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the underlying oracle's observation is old (age=heartbeat+1)", async function () {
        const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

        // Mint some tokens to the vault
        await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
        await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

        const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

        const timestamp = await currentBlockTimestamp();

        // Set the price
        await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 1);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [deployment.vault.address]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=heartbeat)", async function () {
        const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

        // Mint some tokens to the vault
        await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
        await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

        const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

        const timestamp = await currentBlockTimestamp();

        // Set the price
        await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [deployment.vault.address]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=heartbeat-1)", async function () {
        const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

        // Mint some tokens to the vault
        await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
        await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

        const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

        const timestamp = await currentBlockTimestamp();

        // Set the price
        await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + deployment.heartbeat - 1);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [deployment.vault.address]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=0)", async function () {
        const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

        // Mint some tokens to the vault
        await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
        await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

        const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

        const timestamp = (await currentBlockTimestamp()) + 10;

        // Set the price
        await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [deployment.vault.address]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });

    it("Returns true if the underlying oracle's observation is fresh (age=1)", async function () {
        const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

        // Mint some tokens to the vault
        await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
        await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

        const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

        const timestamp = (await currentBlockTimestamp()) + 10;

        // Set the price
        await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

        // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
        await hre.timeAndMine.setTime(timestamp + 1);

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [deployment.vault.address]);
        expect(await deployment.accumulator.canUpdate(updateData)).to.equal(true);
    });
});

describe("SAVPriceAccumulator#fetchPrice", function () {
    var tokenFactory;

    var deployment;
    var quoteToken;
    var token;
    var signer;

    before(async function () {
        tokenFactory = await ethers.getContractFactory("FakeERC20");
        signer = (await ethers.getSigners())[0];
    });

    beforeEach(async function () {
        token = await tokenFactory.deploy("Token 1", "TK1", 18);
        await token.deployed();
        quoteToken = await tokenFactory.deploy("Token 2", "TK2", 18);
        await quoteToken.deployed();

        deployment = await createDefaultDeployment({
            token: token.address,
            quoteToken: quoteToken.address,
        });
    });

    describe("Standard tests", function () {
        it("Returns the correct price", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the price
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(price);
        });

        it("Reverts if the underlying oracle's observation is old (age=heartbeat+2)", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, 2, 3, 5, timestamp);

            // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
            await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 2);

            await expect(deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.be.revertedWith(
                "AbstractOracle: RATE_TOO_OLD"
            );
        });

        it("Reverts if the underlying oracle's observation is old (age=heartbeat+1)", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, 2, 3, 5, timestamp);

            // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
            await hre.timeAndMine.setTime(timestamp + deployment.heartbeat + 1);

            await expect(deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.be.revertedWith(
                "AbstractOracle: RATE_TOO_OLD"
            );
        });

        it("Returns the correct price if the underlying oracle's observation is fresh (age=heartbeat)", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
            await hre.timeAndMine.setTime(timestamp + deployment.heartbeat);

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(price);
        });

        it("Returns the correct price if the underlying oracle's observation is fresh (age=heartbeat-1)", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
            await hre.timeAndMine.setTime(timestamp + deployment.heartbeat - 1);

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(price);
        });

        it("Returns the correct price if the underlying oracle's observation is fresh (age=0)", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = (await currentBlockTimestamp()) + 1;

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
            await hre.timeAndMine.setTime(timestamp);

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(price);
        });

        it("Returns the correct price if the underlying oracle's observation is fresh (age=1)", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = (await currentBlockTimestamp()) + 1;

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // Set the blockchain's timestamp to be heartbeat+1 seconds in the future
            await hre.timeAndMine.setTime(timestamp + 1);

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(price);
        });
    });

    describe("Edge cases", function () {
        it("Returns 0 if the vault has no supply", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(0);
        });
    });

    describe("Differing decimal places (1:1 exchange ratio)", function () {
        it("The vault uses 20 decimals", async function () {
            await deployment.vault.setDecimalOffset(2);

            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // This changes the number of decimals in one whole unit, and the price reflects one whole unit
            // So this should result in the price being the same.
            const expectedPrice = price;

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(expectedPrice);
        });

        it("The accumulator uses 20 decimals", async function () {
            await deployment.accumulator.changeDecimals(20);

            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // The quote token decimals have changed by +2, so the price should be multiplied by 10^2
            const expectedPrice = price.mul(BigNumber.from(10).pow(2));

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(expectedPrice);
        });

        it("The accumulator uses 16 decimals", async function () {
            await deployment.accumulator.changeDecimals(16);

            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // The quote token decimals have changed by -2, so the price should be divided by 10^2
            const expectedPrice = price.div(BigNumber.from(10).pow(2));

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(expectedPrice);
        });

        it("The underlying oracle uses 8 decimals", async function () {
            await deployment.oracle.stubSetPriceDecimals(8);

            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // Price is in 8 decimals, so the price should be multiplied by 10^10
            const expectedPrice = price.mul(BigNumber.from(10).pow(10));

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(expectedPrice);
        });
    });

    describe("Differing exchange ratios", function () {
        it("Double the number of assets to shares", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            // Mint some tokens to the vault
            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            await token.transfer(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            const timestamp = await currentBlockTimestamp();

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            // Value should be double
            const expectedPrice = price.mul(2);

            expect(await deployment.accumulator.stubFetchPrice(deployment.vault.address)).to.equal(expectedPrice);
        });
    });
});

describe("SAVPriceAccumulator#update", function () {
    describe("Standard tests", function () {
        var tokenFactory;

        var deployment;
        var quoteToken;
        var token;
        var signer;

        before(async function () {
            tokenFactory = await ethers.getContractFactory("FakeERC20");
            signer = (await ethers.getSigners())[0];
        });

        beforeEach(async function () {
            token = await tokenFactory.deploy("Token 1", "TK1", 18);
            await token.deployed();
            quoteToken = await tokenFactory.deploy("Token 2", "TK2", 18);
            await quoteToken.deployed();

            deployment = await createDefaultDeployment({
                token: token.address,
                quoteToken: quoteToken.address,
            });
        });

        it("Blocks smart contracts from updating", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const timestamp = await currentBlockTimestamp();

            const callerFactory = await ethers.getContractFactory("SAVPriceAccumulatorUpdater");
            const caller = await callerFactory.deploy(deployment.accumulator.address);

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            await expect(caller.update(deployment.vault.address)).to.be.revertedWith("PriceAccumulator: MUST_BE_EOA");
        });

        it("Reverts if we try to update with only the token address as the update data", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const timestamp = await currentBlockTimestamp();

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            await expect(
                deployment.accumulator.update(
                    ethers.utils.defaultAbiCoder.encode(["address"], [deployment.vault.address])
                )
            ).to.be.reverted;
        });

        it("Performs validation and emits the event", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const timestamp = await currentBlockTimestamp();

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            const updateTx = await deployment.accumulator.update(
                ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256", "uint256"],
                    [deployment.vault.address, price, timestamp]
                )
            );
            const receipt = await updateTx.wait();

            const updateTimestamp = await blockTimestamp(receipt.blockNumber);

            // Expect it to emit ValidationPerformed
            expect(receipt)
                .to.emit(deployment.accumulator, "ValidationPerformed")
                .withArgs(deployment.vault.address, price, price, updateTimestamp, timestamp, true);

            // Expect it to emit Updated
            expect(receipt).to.emit(deployment.accumulator, "Updated").withArgs(deployment.vault.address, price);
        });

        it("Doesn't update if time validation fails", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const timestamp = await currentBlockTimestamp();

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            const providedTimestamp = 1;

            const updateTx = await deployment.accumulator.update(
                ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256", "uint256"],
                    [deployment.vault.address, price, providedTimestamp]
                )
            );
            const receipt = await updateTx.wait();

            const updateTimestamp = await blockTimestamp(receipt.blockNumber);

            // Expect it to emit ValidationPerformed
            expect(receipt)
                .to.emit(deployment.accumulator, "ValidationPerformed")
                .withArgs(deployment.vault.address, price, price, updateTimestamp, providedTimestamp, false);

            // Expect it to not emit Updated
            expect(receipt).to.not.emit(deployment.accumulator, "Updated");
        });

        it("Doesn't update if price validation fails", async function () {
            const quoteTokenDecimals = await deployment.accumulator.quoteTokenDecimals();

            await token.approve(deployment.vault.address, ethers.utils.parseUnits("1000", quoteTokenDecimals));
            await deployment.vault.deposit(ethers.utils.parseUnits("1000", quoteTokenDecimals), signer.address);

            const timestamp = await currentBlockTimestamp();

            const price = ethers.utils.parseUnits("1.23", quoteTokenDecimals);

            // Set the observation
            await deployment.oracle.stubSetObservation(token.address, price, 3, 5, timestamp);

            const providedPrice = 1;

            const updateTx = await deployment.accumulator.update(
                ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256", "uint256"],
                    [deployment.vault.address, providedPrice, timestamp]
                )
            );
            const receipt = await updateTx.wait();

            const updateTimestamp = await blockTimestamp(receipt.blockNumber);

            // Expect it to emit ValidationPerformed
            expect(receipt)
                .to.emit(deployment.accumulator, "ValidationPerformed")
                .withArgs(deployment.vault.address, price, providedPrice, updateTimestamp, timestamp, false);

            // Expect it to not emit Updated
            expect(receipt).to.not.emit(deployment.accumulator, "Updated");
        });
    });
});
