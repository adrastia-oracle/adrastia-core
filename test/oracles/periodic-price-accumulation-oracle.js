const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const PERIOD = 100;
const GRANULARITY = 1;

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60 * 60; // At most (optimistically) 1 hour between every update

const DEFAULT_STATIC_TOKEN_LIQUIDITY = 2;
const DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY = 3;
const DEFAULT_LIQUIDITY_DECIMALS = 0;

async function createDefaultOracle(quoteToken, contractName = "PeriodicPriceAccumulationOracle") {
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const priceAccumulatorStub = await ethers.getContractFactory("PriceAccumulatorStub");
    const priceAccumulator = await priceAccumulatorStub.deploy(
        averagingStrategy.address,
        quoteToken,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );
    await priceAccumulator.deployed();

    const oracleFactory = await ethers.getContractFactory(contractName);
    const oracle = await oracleFactory.deploy(
        priceAccumulator.address,
        quoteToken,
        PERIOD,
        GRANULARITY,
        DEFAULT_STATIC_TOKEN_LIQUIDITY,
        DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY,
        DEFAULT_LIQUIDITY_DECIMALS
    );

    return {
        oracle: oracle,
        priceAccumulator: priceAccumulator,
    };
}

async function createDefaultOracleStub(quoteToken, contractName = "PeriodicPriceAccumulationOracleStub") {
    return await createDefaultOracle(quoteToken, contractName);
}

// Credits: https://stackoverflow.com/questions/53311809/all-possible-combinations-of-a-2d-array-in-javascript
function combos(list, n = 0, result = [], current = []) {
    if (n === list.length) result.push(current);
    else list[n].forEach((item) => combos(list, n + 1, result, [...current, item]));

    return result;
}

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("PeriodicPriceAccumulationOracle#constructor", async function () {
    var oracleFactory;

    var tests = [];

    const testPermutations = [
        [AddressZero, USDC], // priceAccumulator
        [AddressZero, USDC], // quoteToken
        [(BigNumber.from(10), BigNumber.from(100))], // period
        [1, 2], // granularity
        [ethers.utils.parseUnits("1", 18), ethers.utils.parseUnits("100", 18)], // staticTokenLiquidity
        [ethers.utils.parseUnits("1", 18), ethers.utils.parseUnits("100", 18)], // staticQuoteTokenLiquidity
        [0, 18], // liquidityDecimals
    ];

    for (const combo of combos(testPermutations)) {
        tests.push({
            args: {
                priceAccumulator: combo[0],
                quoteToken: combo[1],
                period: combo[2],
                granularity: combo[3],
                staticTokenLiquidity: combo[4],
                staticQuoteTokenLiquidity: combo[5],
                liquidityDecimals: combo[6],
            },
        });
    }

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("PeriodicPriceAccumulationOracle");
    });

    tests.forEach(({ args }) => {
        it(`Should construct the oracle correctly with params ${JSON.stringify(args)}`, async () => {
            const oracle = await oracleFactory.deploy(
                args["priceAccumulator"],
                args["quoteToken"],
                args["period"],
                args["granularity"],
                args["staticTokenLiquidity"],
                args["staticQuoteTokenLiquidity"],
                args["liquidityDecimals"]
            );

            expect(await oracle.priceAccumulator()).to.equal(args["priceAccumulator"]);
            expect(await oracle.quoteToken()).to.equal(args["quoteToken"]);
            expect(await oracle.quoteTokenAddress()).to.equal(args["quoteToken"]);
            expect(await oracle.period()).to.equal(args["period"]);
            expect(await oracle.granularity()).to.equal(args["granularity"]);
            expect(await oracle.liquidityDecimals()).to.equal(args["liquidityDecimals"]);

            if (args["quoteToken"] === USDC) {
                expect(await oracle.quoteTokenName()).to.equal("USD Coin");
                expect(await oracle.quoteTokenSymbol()).to.equal("USDC");
                expect(await oracle.quoteTokenDecimals()).to.equal(6);
            }
        });
    });

    it("Should revert if the period is zero", async function () {
        await expect(oracleFactory.deploy(AddressZero, USDC, 0, GRANULARITY, 2, 2, 0)).to.be.revertedWith(
            "PeriodicOracle: INVALID_PERIOD"
        );
    });

    it("Should revert if the granularity is zero", async function () {
        await expect(oracleFactory.deploy(AddressZero, USDC, PERIOD, 0, 2, 2, 0)).to.be.revertedWith(
            "PeriodicOracle: INVALID_GRANULARITY"
        );
    });

    it("Should revert if the period is not divisible by the granularity", async function () {
        const period = 5;
        const granularity = 2;

        // Assert that the period is not divisible by the granularity
        expect(period % granularity).to.not.equal(0);

        await expect(oracleFactory.deploy(AddressZero, USDC, period, granularity, 2, 2, 0)).to.be.revertedWith(
            "PeriodicOracle: INVALID_PERIOD_GRANULARITY"
        );
    });
});

describe("PeriodicPriceAccumulationOracle#needsUpdate", function () {
    var oracle;

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should require an update if no observations or accumulations have been made", async () => {
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Should require an update if deltaTime == period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);
        await oracle.stubSetAccumulations(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Should require an update if deltaTime > period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);
        await oracle.stubSetAccumulations(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD + 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD + 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Shouldn't require an update if deltaTime < period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);
        await oracle.stubSetAccumulations(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD - 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD - 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Shouldn't require an update if deltaTime == 0", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);
        await oracle.stubSetAccumulations(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime);

        expect(await currentBlockTimestamp()).to.equal(observationTime);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });
});

describe("PeriodicPriceAccumulationOracle#canUpdate", function () {
    var priceAccumulator;
    var oracle;

    var accumulatorUpdateDelayTolerance;

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;

        accumulatorUpdateDelayTolerance = await oracle.accumulatorUpdateDelayTolerance();
    });

    it("Can update when it needs an update and the price accumulator has been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when the price accumulator needs an update but it's been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when the price accumulator needs an update but the price accumulator is in its grace period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber() - 10;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

        // Sanity check: price accumulator is in its grace period
        expect(checkAt).to.be.greaterThan(updatedAt + DEFAULT_HEARTBEAT);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can't update when it needs an update but the price accumulator hasn't been initialized", async function () {
        await priceAccumulator.overrideNeedsUpdate(true, false);

        await oracle.overrideNeedsUpdate(true, true);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it doesn't needs an update and the price accumulator has been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, false);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it doesn't need an update and the price accumulator hasn't been initialized", async function () {
        await priceAccumulator.overrideNeedsUpdate(true, false);

        await oracle.overrideNeedsUpdate(true, false);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when the price accumulator needs an update and hasn't been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber() + 10;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.greaterThanOrEqual(
            updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber()
        );

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });
});

describe("PeriodicPriceAccumulationOracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultPrice(address)"](AddressZero)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should get the set price (=1)", async () => {
        const price = BigNumber.from(1);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, 1);

        expect(await oracle["consultPrice(address)"](AddressZero)).to.equal(price);
    });

    it("Should get the set price (=1e18)", async () => {
        const price = BigNumber.from(10).pow(18);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, 1);

        expect(await oracle["consultPrice(address)"](AddressZero)).to.equal(price);
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const price = await oracle["consultPrice(address)"](await oracle.quoteTokenAddress());

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
    });
});

describe("PeriodicPriceAccumulationOracle#consultPrice(token, maxAge = 0)", function () {
    var priceAccumulator;
    var oracle;

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Should get the set price (=1)", async () => {
        const price = BigNumber.from(1);

        await priceAccumulator.setPrice(AddressZero, price);

        expect(await oracle["consultPrice(address,uint256)"](AddressZero, 0)).to.equal(price);
    });
});

describe("PeriodicPriceAccumulationOracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Should get the set price (=1)", async () => {
        const observationTime = await currentBlockTimestamp();
        const price = BigNumber.from(1);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, observationTime);

        expect(await oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.equal(price);
    });

    it("Should get the set price (=1e18)", async () => {
        const observationTime = await currentBlockTimestamp();
        const price = BigNumber.from(10).pow(18);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, observationTime);

        expect(await oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.equal(price);
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const price = await oracle["consultPrice(address,uint256)"](await oracle.quoteTokenAddress(), MAX_AGE);

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
    });
});

describe("PeriodicPriceAccumulationOracle#consultLiquidity(token)", function () {
    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address)"](AddressZero)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](
            await oracle.quoteTokenAddress()
        );

        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set token liquidity (=${args["tokenLiquidity"]}) and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](AddressZero);

            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("PeriodicPriceAccumulationOracle#consultLiquidity(token, maxAge = 0)", function () {
    var priceAccumulator;
    var oracle;

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;
        priceAccumulator = deployment.priceAccumulator;
    });

    it(
        "Should get the set liquidities (" +
            DEFAULT_STATIC_TOKEN_LIQUIDITY +
            ", " +
            DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY +
            ")",
        async () => {
            const price = BigNumber.from(1);

            await priceAccumulator.setPrice(AddressZero, price);

            const liquidity = await oracle["consultLiquidity(address,uint256)"](AddressZero, 0);

            expect(liquidity["tokenLiquidity"]).to.equal(DEFAULT_STATIC_TOKEN_LIQUIDITY);
            expect(liquidity["quoteTokenLiquidity"]).to.equal(DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY);
        }
    );
});

describe("PeriodicPriceAccumulationOracle#consultLiquidity(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
            await oracle.quoteTokenAddress(),
            MAX_AGE
        );

        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set token liquidity (=${args["tokenLiquidity"]}) and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
                AddressZero,
                MAX_AGE
            );

            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("PeriodicPriceAccumulationOracle#consult(token)", function () {
    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consult(address)"](AddressZero)).to.be.revertedWith("AbstractOracle: MISSING_OBSERVATION");
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address)"](
            await oracle.quoteTokenAddress()
        );

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set price (=${args["price"]}), token liquidity (=${args["tokenLiquidity"]}), and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address)"](AddressZero);

            expect(price).to.equal(_price);
            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("PeriodicPriceAccumulationOracle#consult(token, maxAge = 0)", function () {
    var priceAccumulator;
    var oracle;

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        priceAccumulator = deployment.priceAccumulator;
        oracle = deployment.oracle;
    });

    it("Should get the set price (1) and liquidities (2,3)", async () => {
        const price = BigNumber.from(1);

        await priceAccumulator.setPrice(AddressZero, price);

        const consultation = await oracle["consult(address,uint256)"](AddressZero, 0);

        expect(consultation["price"]).to.equal(price);
        expect(consultation["tokenLiquidity"]).to.equal(DEFAULT_STATIC_TOKEN_LIQUIDITY);
        expect(consultation["quoteTokenLiquidity"]).to.equal(DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY);
    });
});

describe("PeriodicPriceAccumulationOracle#consult(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const deployment = await createDefaultOracleStub(USDC);
        oracle = deployment.oracle;

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address,uint256)"](
            await oracle.quoteTokenAddress(),
            MAX_AGE
        );

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set price (=${args["price"]}), token liquidity (=${args["tokenLiquidity"]}), and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address,uint256)"](
                AddressZero,
                MAX_AGE
            );

            expect(price).to.equal(_price);
            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("PeriodicPriceAccumulationOracle#update", function () {
    this.timeout(100000);

    var quoteToken;
    var token;

    var curvePool;
    var priceAccumulator;
    var oracle;

    var accumulatorUpdateDelayTolerance;

    var expectedTokenLiquidity;
    var expectedQuoteTokenLiquidity;
    var expectedPrice;

    beforeEach(async () => {
        // Create tokens
        const erc20Factory = await ethers.getContractFactory("FakeERC20");

        token = await erc20Factory.deploy("Token", "T", 18);
        quoteToken = await erc20Factory.deploy("Quote Token", "QT", 18);

        await token.deployed();
        await quoteToken.deployed();

        // Deploy the curve pool
        const poolFactory = await ethers.getContractFactory("CurvePoolStub");
        curvePool = await poolFactory.deploy([token.address, quoteToken.address]);
        await curvePool.deployed();

        await deployAdrastiaContracts();

        expectedTokenLiquidity = BigNumber.from(0);
        expectedQuoteTokenLiquidity = BigNumber.from(0);
        expectedPrice = BigNumber.from(0);
    });

    async function deployAdrastiaContracts() {
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();

        // Deploy price accumulator
        const priceAccumulatorFactory = await ethers.getContractFactory("CurvePriceAccumulatorStub");
        priceAccumulator = await priceAccumulatorFactory.deploy(
            averagingStrategy.address,
            curvePool.address,
            2,
            quoteToken.address,
            quoteToken.address,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );
        await priceAccumulator.deployed();

        // Deploy oracle
        const oracleFactory = await ethers.getContractFactory("PeriodicPriceAccumulationOracleStub");
        oracle = await oracleFactory.deploy(
            priceAccumulator.address,
            quoteToken.address,
            1,
            GRANULARITY,
            DEFAULT_STATIC_TOKEN_LIQUIDITY,
            DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY,
            DEFAULT_LIQUIDITY_DECIMALS
        );

        accumulatorUpdateDelayTolerance = await oracle.accumulatorUpdateDelayTolerance();
    }

    async function addLiquidity(tokenLiquidity, quoteTokenLiquidity) {
        await curvePool.stubSetBalance(token.address, tokenLiquidity);
        await curvePool.stubSetBalance(quoteToken.address, quoteTokenLiquidity);

        const decimalFactor = BigNumber.from(10).pow(await token.decimals());
        const precisionFactor = BigNumber.from(10).pow(6);

        const price = quoteTokenLiquidity
            .mul(precisionFactor)
            .mul(decimalFactor)
            .div(tokenLiquidity)
            .div(precisionFactor);

        await curvePool.stubSetRate(token.address, quoteToken.address, price);

        expectedTokenLiquidity = DEFAULT_STATIC_TOKEN_LIQUIDITY;
        expectedQuoteTokenLiquidity = DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY;
        expectedPrice = price;
    }

    describe("Reverts when", function () {
        beforeEach(async () => {
            const deployment = await createDefaultOracleStub(USDC);
            priceAccumulator = deployment.priceAccumulator;
            oracle = deployment.oracle;
        });

        it("Price accumulator is out-of-date", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt;

            await priceAccumulator.overrideNeedsUpdate(true, true);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: liquidity accumulator is up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await expect(oracle.update(updateData)).to.be.revertedWith("PriceAccumulatorNeedsUpdate");
        });
    });

    describe("Doesn't revert when", function () {
        beforeEach(async () => {
            const deployment = await createDefaultOracleStub(USDC);
            priceAccumulator = deployment.priceAccumulator;
            oracle = deployment.oracle;
        });

        it("Price accumulator needs an update but it's been updated within the last period", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt;

            await priceAccumulator.overrideNeedsUpdate(true, true);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

            await expect(oracle.update(updateData)).to.not.be.reverted;
        });
    });

    describe("Return value differences with different accumulations", function () {
        beforeEach(async () => {
            const deployment = await createDefaultOracleStub(USDC);
            priceAccumulator = deployment.priceAccumulator;
            oracle = deployment.oracle;
        });

        it("Should return false when both of the price accumulator hasn't changed", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt + 1;

            // Set the "last accumulation"
            await oracle.stubSetAccumulations(token.address, 1, 1, 1, updatedAt);

            // Make the accumulators not need an update (i.e. up-to-date)
            await priceAccumulator.overrideNeedsUpdate(true, false);

            // Make the accumulators use the last accumulations as the current
            await priceAccumulator.overrideCurrentAccumulation(true);

            // Set the "current accumulations"
            await priceAccumulator.stubSetAccumulation(token.address, 1, updatedAt);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            expect(await oracle.callStatic.update(updateData)).to.equal(false);
        });

        it("Should return true when the both the price accumulation has been updated", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt + 2;

            // Set the "last accumulation"
            await oracle.stubSetAccumulations(token.address, 1, 1, 1, updatedAt);

            // Make the accumulators not need an update (i.e. up-to-date)
            await priceAccumulator.overrideNeedsUpdate(true, false);

            // Make the accumulators use the last accumulations as the current
            await priceAccumulator.overrideCurrentAccumulation(true);

            // Set the "current accumulations"
            await priceAccumulator.stubSetAccumulation(token.address, 1, updatedAt + 1);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt + 1);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + DEFAULT_HEARTBEAT + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            expect(await oracle.callStatic.update(updateData)).to.equal(true);
        });
    });

    it("Shouldn't update anything if the current accumulations' timestamps equals the last", async function () {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const realTokenLiquidity = BigNumber.from(1000);
        const realQuoteTokenLiquidity = BigNumber.from(20000);

        // Add liquidity. Price = 20.
        await addLiquidity(realTokenLiquidity, realQuoteTokenLiquidity);

        const updateData = ethers.utils.hexZeroPad(token.address, 32);

        // Update accumulators
        await priceAccumulator.update(updateData);

        const fakeAccumulationTimestamp = (await currentBlockTimestamp()) + 100;
        const fakeObservationTimestamp = BigNumber.from(1);
        const fakePrice = BigNumber.from(1);
        const fakeTokenLiquidity = BigNumber.from(1);
        const fakeQuoteTokenLiquidity = BigNumber.from(1);

        await oracle.stubSetObservation(
            token.address,
            fakePrice,
            fakeTokenLiquidity,
            fakeQuoteTokenLiquidity,
            fakeObservationTimestamp
        );

        await oracle.stubSetAccumulations(
            token.address,
            fakePrice,
            fakeTokenLiquidity,
            fakeQuoteTokenLiquidity,
            fakeAccumulationTimestamp
        );

        // Make sure that we perform an update
        await oracle.overrideNeedsUpdate(true, true);

        // Next block timestamp will equal fakeAccumulationTimestamp
        await hre.timeAndMine.setTime(fakeAccumulationTimestamp - 1);

        const updateTx = await oracle.update(updateData);

        await expect(updateTx).to.not.emit(oracle, "Updated");

        const [oPrice, oTokenLiqudity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
            token.address
        );

        expect(oPrice, "Observation price").to.equal(fakePrice);
        expect(oTokenLiqudity, "Observation token liquidity").to.equal(fakeTokenLiquidity);
        expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(fakeQuoteTokenLiquidity);
        expect(oTimestamp, "Observation timestamp").to.equal(fakeObservationTimestamp);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);

        expect(cumulativePrice, "Cumulative price").to.equal(fakePrice);
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.equal(fakeAccumulationTimestamp);
    });

    it("Shouldn't update observation or emit Updated when both of the last accumulations are too old", async function () {
        // Add liquidity
        await addLiquidity(
            ethers.utils.parseUnits("1000", await token.decimals()),
            ethers.utils.parseUnits("1000", await quoteToken.decimals())
        );

        const updateData = ethers.utils.hexZeroPad(token.address, 32);

        // Update accumulators to initialize the oracle
        await priceAccumulator.update(updateData);

        // First update of the oracle
        await oracle.update(updateData);

        const period = await oracle.period();

        // Fast forwward to the next update
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + period.toNumber() + 1);

        // Update everything
        await priceAccumulator.update(updateData);
        await oracle.update(updateData);

        // Change liquidity and price so that the next oracle update will report different values if the update
        // is performed (it shouldn't be).
        await addLiquidity(
            ethers.utils.parseUnits("100000", await token.decimals()),
            ethers.utils.parseUnits("10000000", await quoteToken.decimals())
        );

        // Fast forward past the minimum update delay
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + DEFAULT_UPDATE_DELAY + 1);

        // Update the accumulators to record the change
        await priceAccumulator.update(updateData);

        const updateDelayTolerance = await oracle.updateDelayTolerance();

        // Fast forward past the update delay tolerance
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + updateDelayTolerance.toNumber() + 1);

        // Update accumulators so that we know they won't prevent the oracle from updating
        await priceAccumulator.update(updateData);

        // Record old accumulations
        const [oldCumulativePrice, oldCumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);

        // Record old observation
        const [oldPrice, oldTokenLiquidity, oldQuoteTokenLiquidity, oldTimestamp] = await oracle.getLatestObservation(
            token.address
        );

        // Now we update the oracle. This should fail as the last price accumulation is too old
        const updateTx = await oracle.update(updateData);

        // Shouldn't emit Updated
        await expect(updateTx).to.not.emit(oracle, "Updated");

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
            token.address
        );

        // Observation should not update
        expect(oPrice, "Observation price").to.equal(oldPrice);
        expect(oTokenLiquidity, "Observation token liquidity").to.equal(oldTokenLiquidity);
        expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(oldQuoteTokenLiquidity);
        expect(oTimestamp, "Observation timestamp").to.equal(oldTimestamp);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);

        // Accumulation should update
        expect(cumulativePrice, "Cumulative price").to.not.equal(oldCumulativePrice);
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.not.equal(oldCumulativePriceTimestamp);
    });

    it("Shouldn't update observation timestamp or emit Updated when there's no price", async function () {
        // Add liquidity
        await addLiquidity(
            ethers.utils.parseUnits("1000", await token.decimals()),
            ethers.utils.parseUnits("1000", await quoteToken.decimals())
        );

        const updateData = ethers.utils.hexZeroPad(token.address, 32);

        // Update accumulators
        await priceAccumulator.update(updateData);

        const updateTx = await oracle.update(updateData);

        // Shouldn't emite Updated since the oracle doesn't have enough info to calculate price
        await expect(updateTx).to.not.emit(oracle, "Updated");

        const [, , , oTimestamp] = await oracle.getLatestObservation(token.address);

        // Observation timestamp should not update since the oracle doesn't have enough info to calculate price
        expect(oTimestamp, "Observation timestamp").to.equal(0);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);

        // Accumulation should update
        expect(cumulativePrice, "Cumulative price").to.not.equal(0);
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.not.equal(0);
    });

    it("Should revert if token == quoteToken", async function () {
        await expect(oracle.update(ethers.utils.hexZeroPad(quoteToken.address, 32))).to.be.reverted;
    });

    it("Should revert if token == address(0)", async function () {
        await expect(oracle.update(ethers.utils.hexZeroPad(AddressZero, 32))).to.be.reverted;
    });

    it("Shouldn't update if not needed", async function () {
        await oracle.overrideNeedsUpdate(true, false);

        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token.address, 32))).to.equal(false);

        const [pPrice, pTokenLiqudity, pQuoteTokenLiquidity, pTimestamp] = await oracle.getLatestObservation(
            token.address
        );

        const updateTxPromise = oracle.update(ethers.utils.hexZeroPad(token.address, 32));

        await expect(updateTxPromise).to.not.emit(oracle, "Updated");

        const [price, tokenLiqudity, quoteTokenLiquidity, timestamp] = await oracle.getLatestObservation(token.address);

        // Verify the current observation hasn't changed
        expect(price).to.equal(pPrice);
        expect(tokenLiqudity).to.equal(pTokenLiqudity);
        expect(quoteTokenLiquidity).to.equal(pQuoteTokenLiquidity);
        expect(timestamp).to.equal(pTimestamp);
    });

    const testUpdateSuccess = async function (_tokenLiquidity, _quoteTokenLiquidity) {
        await addLiquidity(_tokenLiquidity, _quoteTokenLiquidity);

        // Verify that the expected price based off input matches the expected price based off the uniswap helper
        {
            const decimalFactor = BigNumber.from(10).pow(await token.decimals());
            const precisionFactor = BigNumber.from(10).pow(6);

            const expectedPriceFromInput = _quoteTokenLiquidity
                .mul(precisionFactor)
                .mul(decimalFactor)
                .div(_tokenLiquidity)
                .div(precisionFactor);

            const expectedPriceFloor = expectedPriceFromInput.sub(expectedPriceFromInput.div(100));
            const expectedPriceCeil = expectedPriceFromInput.add(expectedPriceFromInput.div(100));

            // Check that price is equal to expected price +- 1% to account for loss of precision
            expect(expectedPrice).to.be.within(expectedPriceFloor, expectedPriceCeil);
        }

        // Perform two initial updates so that the accumulators are properly initialized
        {
            await hre.timeAndMine.setTime((await currentBlockTimestamp()) + PERIOD);
            await oracle.update(ethers.utils.hexZeroPad(token.address, 32));
            await hre.timeAndMine.setTime((await currentBlockTimestamp()) + PERIOD);
            await oracle.update(ethers.utils.hexZeroPad(token.address, 32));
        }

        const expectedTimestamp = (await currentBlockTimestamp()) + 100;

        await hre.timeAndMine.setTimeNextBlock(expectedTimestamp);

        const updateReceipt = await oracle.update(ethers.utils.hexZeroPad(token.address, 32));

        [price, tokenLiquidity, quoteTokenLiquidity, timestamp] = await oracle.getLatestObservation(token.address);

        // Verify that the observation matches what's expected
        {
            const expectedPriceFloor = expectedPrice.sub(expectedPrice.div(100));
            const expectedPriceCeil = expectedPrice.add(expectedPrice.div(100));

            // Check that price is equal to expected price +- 1% to account for loss of precision
            expect(price).to.be.within(expectedPriceFloor, expectedPriceCeil);

            expect(tokenLiquidity).to.equal(expectedTokenLiquidity);
            expect(quoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);

            expect(timestamp).to.equal(expectedTimestamp);
        }

        // Verify that the log matches the observation
        await expect(updateReceipt)
            .to.emit(oracle, "Updated")
            .withArgs(token.address, price, tokenLiquidity, quoteTokenLiquidity, timestamp);
    };

    const liquidityPermutations = [
        [
            // tokenLiquidity
            ethers.utils.parseUnits("1000.0", 18),
            ethers.utils.parseUnits("10000.0", 18),
            ethers.utils.parseUnits("500000.0", 18),
        ],
        [
            // quoteTokenLiquidity
            ethers.utils.parseUnits("1000.0", 18),
            ethers.utils.parseUnits("10000.0", 18),
            ethers.utils.parseUnits("500000.0", 18),
        ],
    ];

    var updateTestCombos = combos(liquidityPermutations);

    function describeSingleTokenTests() {
        for (const combo of updateTestCombos) {
            it(`Should update successfully with tokenLiquidity=${combo[0].toString()} and quoteTokenLiquidity=${combo[1].toString()}`, async function () {
                await testUpdateSuccess(combo[0], combo[1]);
            });
        }
    }

    describe("token decimals = 18, quoteToken decimals = 18", function () {
        beforeEach(async () => {
            await token.setDecimals(18);
            await quoteToken.setDecimals(18);
            await deployAdrastiaContracts();
        });

        describeSingleTokenTests();
    });

    describe("token decimals = 6, quoteToken decimals = 18", function () {
        beforeEach(async () => {
            await token.setDecimals(18);
            await quoteToken.setDecimals(18);
            await deployAdrastiaContracts();
        });

        describeSingleTokenTests();
    });

    describe("token decimals = 18, quoteToken decimals = 6", function () {
        beforeEach(async () => {
            await token.setDecimals(18);
            await quoteToken.setDecimals(6);
            await deployAdrastiaContracts();
        });

        describeSingleTokenTests();
    });

    describe("token decimals = 6, quoteToken decimals = 6", function () {
        beforeEach(async () => {
            await token.setDecimals(18);
            await quoteToken.setDecimals(6);
            await deployAdrastiaContracts();
        });

        describeSingleTokenTests();
    });
});

describe("PeriodicPriceAccumulationOracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const deployment = await createDefaultOracle(USDC);
        oracle = deployment.oracle;

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IOracle", async () => {
        const interfaceId = await interfaceIds.iOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IPeriodic", async () => {
        const interfaceId = await interfaceIds.iPeriodic();
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

    it("Should support IHasPriceAccumulator", async () => {
        const interfaceId = await interfaceIds.iHasPriceAccumulator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHistoricalPriceAccumulationOracle", async () => {
        const interfaceId = await interfaceIds.iHistoricalPriceAccumulationOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});

describe("PeriodicPriceAccumulationOracle#push w/ higher granularity", function () {
    const OUR_PERIOD = 4;
    const OUR_GRANULARITY = 4;

    var priceAccumulator;
    var liquidityAccumulator;
    var oracle;

    beforeEach(async () => {
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();

        // Deploy liquidity accumulator
        const liquidityAccumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            averagingStrategy.address,
            USDC,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );
        await liquidityAccumulator.deployed();

        // Deploy price accumulator
        const priceAccumulatorFactory = await ethers.getContractFactory("PriceAccumulatorStub");
        priceAccumulator = await priceAccumulatorFactory.deploy(
            averagingStrategy.address,
            USDC,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );
        await priceAccumulator.deployed();

        // Deploy oracle
        const oracleFactory = await ethers.getContractFactory("PeriodicPriceAccumulationOracleStub");
        oracle = await oracleFactory.deploy(
            priceAccumulator.address,
            USDC,
            OUR_PERIOD,
            OUR_GRANULARITY,
            DEFAULT_STATIC_TOKEN_LIQUIDITY,
            DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY,
            DEFAULT_LIQUIDITY_DECIMALS
        );
    });

    it("Doesn't update the observation until we have at least 'granularity' number of accumulations already in the buffer", async () => {
        var totalPushed = 0;

        // Push OUR_GRANULARITY times
        for (var i = 0; i < OUR_GRANULARITY; ++i) {
            ++totalPushed;
            await expect(
                await oracle.stubPush(GRT, totalPushed, totalPushed, totalPushed, totalPushed, totalPushed)
            ).to.not.emit(oracle, "Updated");
        }

        // Sanity check that we have OUR_GRANULARITY accumulations
        expect(await oracle.getPriceAccumulationsCount(GRT)).to.equal(OUR_GRANULARITY);

        // Sanity check that we don't have any observations
        var observation = await oracle.getLatestObservation(GRT);
        expect(observation.timestamp).to.equal(0);

        // Push one more time. This should trigger an observation.
        ++totalPushed;
        await expect(
            await oracle.stubPush(GRT, totalPushed, totalPushed, totalPushed, totalPushed, totalPushed)
        ).to.emit(oracle, "Updated");

        // Sanity check that we have OUR_GRANULARITY accumulations
        expect(await oracle.getPriceAccumulationsCount(GRT)).to.equal(OUR_GRANULARITY);

        // Sanity check that we have an observation
        observation = await oracle.getLatestObservation(GRT);
        expect(observation.timestamp).to.not.equal(0);
    });

    async function verifyObservationCorrectness() {
        var totalPushed = 0;

        // Push OUR_GRANULARITY times
        for (var i = 0; i < OUR_GRANULARITY; ++i) {
            ++totalPushed;
            const pushReceipt = await oracle.stubPush(
                GRT,
                totalPushed ** 2,
                totalPushed,
                totalPushed ** 2,
                totalPushed ** 2,
                totalPushed
            );

            // Check that the event params match the latest accumulation
            await expect(pushReceipt)
                .to.emit(oracle, "AccumulationPushed")
                .withArgs(GRT, totalPushed ** 2, totalPushed);
        }

        // Sanity check that we have OUR_GRANULARITY accumulations
        expect(await oracle.getPriceAccumulationsCount(GRT)).to.equal(OUR_GRANULARITY);

        // We should start generating observations at the next push. We now push 4x our capacity.
        const capacity = await oracle.getPriceAccumulationsCapacity(GRT);

        var totalObservations = 0;

        for (var i = 0; i < capacity * 4; ++i) {
            ++totalPushed;
            const pushReceipt = await oracle.stubPush(
                GRT,
                totalPushed ** 2,
                totalPushed,
                totalPushed ** 2,
                totalPushed ** 2,
                totalPushed
            );
            ++totalObservations;

            const observation = await oracle.getLatestObservation(GRT);

            // Note: manually verified that this formula is correct
            const expectedValue = OUR_GRANULARITY + totalObservations * 2;

            // Check that the observation is correct
            expect(observation.price).to.equal(expectedValue);
            expect(observation.tokenLiquidity).to.equal(DEFAULT_STATIC_TOKEN_LIQUIDITY);
            expect(observation.quoteTokenLiquidity).to.equal(DEFAULT_STATIC_QUOTE_TOKEN_LIQUIDITY);
            expect(observation.timestamp).to.equal(await blockTimestamp(pushReceipt.blockNum));

            // Check that the event params match the observation
            await expect(pushReceipt)
                .to.emit(oracle, "Updated")
                .withArgs(
                    GRT,
                    observation.price,
                    observation.tokenLiquidity,
                    observation.quoteTokenLiquidity,
                    observation.timestamp
                );

            // Check that the event params match the latest accumulation
            await expect(pushReceipt)
                .to.emit(oracle, "AccumulationPushed")
                .withArgs(GRT, totalPushed ** 2, totalPushed);
        }
    }

    it("Uses the correct accumulations to calculate the observation when the accumulation buffers use the default capacity", async () => {
        await verifyObservationCorrectness();
    });

    it("Uses the correct accumulations to calculate the observation when the accumulation buffers are 1.5x larger than the default capacity", async () => {
        const newCapacity = Math.trunc(OUR_GRANULARITY * 1.5);

        // Sanity check that newCapacity is larger than the default
        expect(newCapacity).to.be.greaterThan(OUR_GRANULARITY);

        // Set the new capacity
        await oracle.setPriceAccumulationsCapacity(GRT, newCapacity);

        // Sanity check that the new capacity is set
        expect(await oracle.getPriceAccumulationsCapacity(GRT)).to.equal(newCapacity);

        await verifyObservationCorrectness();
    });

    it("Uses the correct accumulations to calculate the observation when the accumulation buffers are 2x larger than the default capacity", async () => {
        const newCapacity = OUR_GRANULARITY * 2;

        // Sanity check that newCapacity is larger than the default
        expect(newCapacity).to.be.greaterThan(OUR_GRANULARITY);

        // Set the new capacity
        await oracle.setPriceAccumulationsCapacity(GRT, newCapacity);

        // Sanity check that the new capacity is set
        expect(await oracle.getPriceAccumulationsCapacity(GRT)).to.equal(newCapacity);

        await verifyObservationCorrectness();
    });

    it("Uses the correct accumulations to calculate the observation when the accumulation buffers are 4x larger than the default capacity", async () => {
        const newCapacity = OUR_GRANULARITY * 4;

        // Sanity check that newCapacity is larger than the default
        expect(newCapacity).to.be.greaterThan(OUR_GRANULARITY);

        // Set the new capacity
        await oracle.setPriceAccumulationsCapacity(GRT, newCapacity);

        // Sanity check that the new capacity is set
        expect(await oracle.getPriceAccumulationsCapacity(GRT)).to.equal(newCapacity);

        await verifyObservationCorrectness();
    });
});

function describeHistoricalAccumulationOracleTests(type) {
    describe("PeriodicPriceAccumulationOracle - IHistorical" + type + "AccumulationOracle implementation", function () {
        var priceAccumulator;
        var oracle;

        beforeEach(async () => {
            const deployment = await createDefaultOracleStub(USDC);
            priceAccumulator = deployment.priceAccumulator;
            oracle = deployment.oracle;
        });

        describe("PeriodicPriceAccumulationOracle#initializeBuffers", function () {
            it("Can't be called twice", async function () {
                await oracle.stubInitializeBuffers(GRT);

                await expect(oracle.stubInitializeBuffers(GRT)).to.be.revertedWith("BufferAlreadyInitialized");
            });

            it("Emits the correct event", async function () {
                await expect(oracle.stubInitializeBuffers(GRT))
                    .to.emit(oracle, "AccumulationCapacityInitialized")
                    .withArgs(GRT, GRANULARITY);
            });
        });

        const setCapacityFunctionName = "set" + type + "AccumulationsCapacity";
        const getCapacityFunctionName = "get" + type + "AccumulationsCapacity";
        const getCountFunctionName = "get" + type + "AccumulationsCount";
        const getFunctionName2Params = "get" + type + "Accumulations(address,uint256)";
        const getFunctionName4Params = "get" + type + "Accumulations(address,uint256,uint256,uint256)";
        const getAtFunctionName = "get" + type + "AccumulationAt";

        describe("PeriodicPriceAccumulationOracle#" + setCapacityFunctionName, function () {
            it("Should revert if the amount is less than the existing capacity", async function () {
                await oracle[setCapacityFunctionName](GRT, 4);

                await expect(oracle[setCapacityFunctionName](GRT, 2)).to.be.revertedWith("CapacityCannotBeDecreased");
            });

            it("Should revert if the amount is 0", async function () {
                await expect(oracle[setCapacityFunctionName](GRT, 0)).to.be.revertedWith("CapacityCannotBeDecreased");
            });

            it("Should revert if the amount is larger than the maximum capacity", async function () {
                await expect(oracle[setCapacityFunctionName](GRT, 65536)).to.be.revertedWith("CapacityTooLarge");
            });

            it("Should emit an event when the capacity is changed", async function () {
                const amount = 20;

                const initialAmount = await oracle[getCapacityFunctionName](GRT);

                // Sanity check that the new amount is greater than the initial amount
                expect(amount).to.be.greaterThan(initialAmount.toNumber());

                await expect(oracle[setCapacityFunctionName](GRT, amount))
                    .to.emit(oracle, "AccumulationCapacityIncreased")
                    .withArgs(GRT, initialAmount, amount);
            });

            it("Should not emit an event when the capacity is not changed (with default capacity)", async function () {
                const initialAmount = await oracle[getCapacityFunctionName](GRT);

                await expect(oracle[setCapacityFunctionName](GRT, initialAmount)).to.not.emit(
                    oracle,
                    "AccumulationCapacityIncreased"
                );
            });

            it("Should not emit an event when the capacity is not changed (with non-default capacity)", async function () {
                const initialAmount = await oracle[getCapacityFunctionName](GRT);
                const amount = 20;

                // Sanity check that the new amount is greater than the initial amount
                expect(amount).to.be.greaterThan(initialAmount.toNumber());

                await oracle[setCapacityFunctionName](GRT, amount);

                // Sanity check that the capacity is now the new amount
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(amount);

                // Try again to set it to the same amount
                await expect(oracle[setCapacityFunctionName](GRT, amount)).to.not.emit(
                    oracle,
                    "AccumulationCapacityIncreased"
                );
            });

            it("Should update the capacity", async function () {
                const amount = 20;

                // Sanity check that the new amount is greater than the initial amount
                expect(amount).to.be.greaterThan((await oracle[getCapacityFunctionName](GRT)).toNumber());

                await oracle[setCapacityFunctionName](GRT, amount);

                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(amount);
            });

            it("Added capacity should not be filled until our latest accumulation is beside an uninitialized accumulation", async function () {
                const workingCapacity = 6;

                var totalPushed = 0;

                // Set the capacity to the working capacity
                await oracle[setCapacityFunctionName](GRT, workingCapacity);

                // Push workingCapacity + 1 accumulations so that the buffer is full and the latest accumulation is at the start of the buffer
                for (let i = 0; i < workingCapacity + 1; ++i) {
                    ++totalPushed;
                    await oracle.stubPush(GRT, totalPushed, totalPushed, totalPushed, totalPushed, totalPushed);
                }

                // Sanity check that the buffer is full
                expect(await oracle[getCountFunctionName](GRT)).to.equal(workingCapacity);

                // Increase the capacity by 1
                await oracle[setCapacityFunctionName](GRT, workingCapacity + 1);

                // We should need to push workingCapacity accumulations before the new capacity is filled
                for (let i = 0; i < workingCapacity - 1; ++i) {
                    ++totalPushed;
                    await oracle.stubPush(GRT, totalPushed, totalPushed, totalPushed, totalPushed, totalPushed);

                    // Sanity check that the buffer is still not full
                    expect(await oracle[getCountFunctionName](GRT)).to.equal(workingCapacity);
                }

                // Push one more accumulation. This should fill the new capacity
                ++totalPushed;
                await oracle.stubPush(GRT, totalPushed, totalPushed, totalPushed, totalPushed, totalPushed);

                // Check that the buffer is now full
                expect(await oracle[getCountFunctionName](GRT)).to.equal(workingCapacity + 1);
            });
        });

        describe("PeriodicPriceAccumulationOracle#" + getCapacityFunctionName, function () {
            it("Should return the default capacity when the buffer is uninitialized", async function () {
                const initialCapacity = await oracle.granularity();

                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(initialCapacity);
            });

            it("Should return the capacity when the buffer is initialized", async function () {
                await oracle.stubInitializeBuffers(GRT);

                const initialCapacity = await oracle.granularity();

                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(initialCapacity);
            });

            it("Should return the capacity after the buffer has been resized", async function () {
                const amount = 20;

                // Sanity check that the new amount is greater than the initial amount
                expect(amount).to.be.greaterThan((await oracle[getCapacityFunctionName](GRT)).toNumber());

                await oracle[setCapacityFunctionName](GRT, amount);

                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(amount);
            });
        });

        describe("PeriodicPriceAccumulationOracle#" + getCountFunctionName, function () {
            it("Should return 0 when the buffer is uninitialized", async function () {
                expect(await oracle[getCountFunctionName](GRT)).to.equal(0);
            });

            it("Should return 0 when the buffer is initialized but empty", async function () {
                await oracle.stubInitializeBuffers(GRT);

                expect(await oracle[getCountFunctionName](GRT)).to.equal(0);
            });

            it("Increasing capacity should not change the accumulations count", async function () {
                const initialAmount = 4;

                await oracle[setCapacityFunctionName](GRT, initialAmount);

                // Push 2 accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                // Sanity check that the accumulations count is 2
                expect(await oracle[getCountFunctionName](GRT)).to.equal(2);

                // Increase the capacity by 1
                await oracle[setCapacityFunctionName](GRT, initialAmount + 1);

                // The accumulations count should still be 2
                expect(await oracle[getCountFunctionName](GRT)).to.equal(2);
            });

            it("Should be limited by the capacity", async function () {
                const capacity = 6;

                var totalPushed = 0;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Push capacity + 1 accumulations
                for (let i = 0; i < capacity + 1; ++i) {
                    ++totalPushed;
                    await oracle.stubPush(GRT, totalPushed, totalPushed, totalPushed, totalPushed, totalPushed);
                }

                // The accumulations count should be limited by the capacity
                expect(await oracle[getCountFunctionName](GRT)).to.equal(capacity);
            });
        });

        describe("PeriodicPriceAccumulationOracle#" + getFunctionName4Params, function () {
            it("Should return an empty array when amount is 0", async function () {
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);

                const accumulations = await oracle[getFunctionName4Params](GRT, 0, 0, 1);

                expect(accumulations.length).to.equal(0);
            });

            it("Should revert if the offset equals the number of accumulations", async function () {
                // Push 1 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);

                await expect(oracle[getFunctionName4Params](GRT, 1, 1, 1)).to.be.revertedWith("InsufficientData");
            });

            it("Should revert if the offset equals the number of accumulations but is less than the capacity", async function () {
                const capacity = 6;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 1 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);

                await expect(oracle[getFunctionName4Params](GRT, 1, 1, 1)).to.be.revertedWith("InsufficientData");
            });

            it("Should revert if the amount exceeds the number of accumulations", async function () {
                // Push 1 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);

                await expect(oracle[getFunctionName4Params](GRT, 2, 0, 1)).to.be.revertedWith("InsufficientData");
            });

            it("Should revert if the amount exceeds the number of accumulations but is less than the capacity", async function () {
                const capacity = 6;
                const amountToGet = 2;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 1 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);

                // Sanity check that the amount to get is less than the capacity
                expect(amountToGet).to.be.lessThan(capacity);

                await expect(oracle[getFunctionName4Params](GRT, amountToGet, 0, 1)).to.be.revertedWith(
                    "InsufficientData"
                );
            });

            it("Should revert if the amount and offset exceed the number of accumulations", async function () {
                const capacity = 2;
                const amountToGet = 2;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 2 accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                await expect(oracle[getFunctionName4Params](GRT, amountToGet, 1, 1)).to.be.revertedWith(
                    "InsufficientData"
                );
            });

            it("Should revert if the amount and offset exceed the number of accumulations but is less than the capacity", async function () {
                const capacity = 6;
                const amountToGet = 2;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 2 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                await expect(oracle[getFunctionName4Params](GRT, amountToGet, 1, 1)).to.be.revertedWith(
                    "InsufficientData"
                );
            });

            it("Should revert if the increment and amount exceeds the number of accumulations", async function () {
                const capacity = 2;
                const amountToGet = 2;
                const offset = 0;
                const increment = 2;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 2 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                await expect(oracle[getFunctionName4Params](GRT, amountToGet, offset, increment)).to.be.revertedWith(
                    "InsufficientData"
                );
            });

            it("Should revert if the increment and amount exceeds the number of accumulations but is less than the capacity", async function () {
                const capacity = 6;
                const amountToGet = 2;
                const offset = 0;
                const increment = 2;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 2 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                await expect(oracle[getFunctionName4Params](GRT, amountToGet, offset, increment)).to.be.revertedWith(
                    "InsufficientData"
                );
            });

            it("Should revert if the increment, amount, and offset exceeds the number of accumulations", async function () {
                const capacity = 2;
                const amountToGet = 2;
                const offset = 1;
                const increment = 2;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 3 accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);
                await oracle.stubPush(GRT, 3, 3, 3, 3, 3);

                await expect(oracle[getFunctionName4Params](GRT, amountToGet, offset, increment)).to.be.revertedWith(
                    "InsufficientData"
                );
            });

            it("Should revert if the increment, amount, and offset exceeds the number of accumulations but is less than the capacity", async function () {
                const capacity = 6;
                const amountToGet = 2;
                const offset = 1;
                const increment = 2;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 3 accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);
                await oracle.stubPush(GRT, 3, 3, 3, 3, 3);

                await expect(oracle[getFunctionName4Params](GRT, amountToGet, offset, increment)).to.be.revertedWith(
                    "InsufficientData"
                );
            });

            it("Should return the latest accumulation many times when increment is 0", async function () {
                const capacity = 2;
                const amountToGet = 2;
                const offset = 0;
                const increment = 0;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                // Push 2 accumulation
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                const accumulations = await oracle[getFunctionName4Params](GRT, amountToGet, offset, increment);

                expect(accumulations.length).to.equal(amountToGet);

                for (let i = 0; i < amountToGet; ++i) {
                    expect(accumulations[i].timestamp).to.equal(2);
                }
            });

            async function pushAndCheck(capacity, amountToGet, offset, increment, amountToPush) {
                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                for (let i = 0; i < amountToPush; i++) {
                    await oracle.stubPush(GRT, i + 1, i + 1, i + 1, i + 1, i + 1);
                }

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(Math.min(amountToPush, capacity));

                const accumulations = await oracle[getFunctionName4Params](GRT, amountToGet, offset, increment);

                expect(accumulations.length).to.equal(amountToGet);

                for (let i = 0; i < amountToGet; ++i) {
                    // The latest accumulation is at index 0 and will have the highest expected values
                    // The following accumulations will have the expected values decrementing by 1
                    const expected = amountToPush - i * increment - 1 - offset + 1;

                    expect(accumulations[i].timestamp).to.equal(expected);
                }
            }

            describe("An increment of 1", function () {
                describe("An offset of 0", function () {
                    describe("The latest accumulation is at index 0", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 6;
                            const offset = 0;
                            const increment = 1;

                            // Push capacity + 1 accumulations so that the latest accumulation is at index 0
                            const amountToPush = capacity + 1;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });

                    describe("The latest accumulation is at index n-1", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 6;
                            const offset = 0;
                            const increment = 1;

                            // Push capacity accumulations so that the latest accumulation is at index n-1
                            const amountToPush = capacity;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });
                });

                describe("An offset of 1", function () {
                    describe("The latest accumulation is at index 0", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 5;
                            const offset = 1;
                            const increment = 1;

                            // Push capacity + 1 accumulations so that the latest accumulation is at index 0
                            const amountToPush = capacity + 1;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });

                    describe("The latest accumulation is at index n-1", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 5;
                            const offset = 1;
                            const increment = 1;

                            // Push capacity accumulations so that the latest accumulation is at index n-1
                            const amountToPush = capacity;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });
                });
            });

            describe("An increment of 2", function () {
                describe("An offset of 0", function () {
                    describe("The latest accumulation is at index 0", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 3;
                            const offset = 0;
                            const increment = 2;

                            // Push capacity + 1 accumulations so that the latest accumulation is at index 0
                            const amountToPush = capacity + 1;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });

                    describe("The latest accumulation is at index n-1", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 3;
                            const offset = 0;
                            const increment = 2;

                            // Push capacity accumulations so that the latest accumulation is at index n-1
                            const amountToPush = capacity;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });
                });

                describe("An offset of 1", function () {
                    describe("The latest accumulation is at index 0", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 2;
                            const offset = 1;
                            const increment = 2;

                            // Push capacity + 1 accumulations so that the latest accumulation is at index 0
                            const amountToPush = capacity + 1;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });

                    describe("The latest accumulation is at index n-1", function () {
                        it("Should return the accumulations in order", async function () {
                            const capacity = 6;
                            const amountToGet = 2;
                            const offset = 1;
                            const increment = 2;

                            // Push capacity accumulations so that the latest accumulation is at index n-1
                            const amountToPush = capacity;

                            await pushAndCheck(capacity, amountToGet, offset, increment, amountToPush);
                        });
                    });
                });
            });
        });

        describe("PeriodicPriceAccumulationOracle#" + getFunctionName2Params, function () {
            async function pushAndCheck(capacity, amountToGet, offset, increment, amountToPush) {
                await oracle[setCapacityFunctionName](GRT, capacity);

                // Sanity check the capacity
                expect(await oracle[getCapacityFunctionName](GRT)).to.equal(capacity);

                for (let i = 0; i < amountToPush; i++) {
                    await oracle.stubPush(GRT, i + 1, i + 1, i + 1, i + 1, i + 1);
                }

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(Math.min(amountToPush, capacity));

                const accumulations = await oracle[getFunctionName2Params](GRT, amountToGet);

                expect(accumulations.length).to.equal(amountToGet);

                for (let i = 0; i < amountToGet; ++i) {
                    // The latest accumulation is at index 0 and will have the highest expected values
                    // The following accumulations will have the expected values decrementing by 1
                    const expected = amountToPush - i * increment - 1 - offset + 1;

                    expect(accumulations[i].timestamp).to.equal(expected);
                }
            }

            it("Default offset is 0 and increment is 1", async function () {
                const capacity = 6;
                const amountToGet = 6;

                // Push capacity accumulations so that the latest accumulation is at index n-1
                const amountToPush = capacity;

                await pushAndCheck(capacity, amountToGet, 0, 1, amountToPush);
            });
        });

        describe("PeriodicPriceAccumulationOracle#" + getAtFunctionName, function () {
            it("Should revert if the buffer is uninitialized", async function () {
                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(0);

                await expect(oracle[getAtFunctionName](GRT, 0)).to.be.revertedWith("InvalidIndex");
            });

            it("Should revert if the buffer is initialized but empty", async function () {
                await oracle.stubInitializeBuffers(GRT);

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(0);

                await expect(oracle[getAtFunctionName](GRT, 0)).to.be.revertedWith("InvalidIndex");
            });

            it("Should revert if the index exceeds the number of accumulations with a full buffer", async function () {
                const capacity = 6;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Push capacity accumulations
                for (let i = 0; i < capacity; ++i) {
                    await oracle.stubPush(GRT, i + 1, i + 1, i + 1, i + 1, i + 1);
                }

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(capacity);

                await expect(oracle[getAtFunctionName](GRT, capacity)).to.be.revertedWith("InvalidIndex");
            });

            it("Should revert if the index exceeds the number of accumulations but is within the capacity", async function () {
                const capacity = 6;

                await oracle[setCapacityFunctionName](GRT, capacity);

                // Push capacity - 1 accumulations
                for (let i = 0; i < capacity - 1; ++i) {
                    await oracle.stubPush(GRT, i + 1, i + 1, i + 1, i + 1, i + 1);
                }

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(capacity - 1);

                await expect(oracle[getAtFunctionName](GRT, capacity - 1)).to.be.revertedWith("InvalidIndex");
            });

            it("Should return the latest accumulation when index = 0", async function () {
                await oracle[setCapacityFunctionName](GRT, 2);

                // Push capacity accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(2);

                const accumulation = await oracle[getAtFunctionName](GRT, 0);

                expect(accumulation.timestamp).to.equal(2);
            });

            it("Should return the latest accumulation when index = 0 and the start was just overwritten", async function () {
                await oracle[setCapacityFunctionName](GRT, 2);

                // Push capacity + 1 accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);
                await oracle.stubPush(GRT, 3, 3, 3, 3, 3);

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(2);

                const accumulation = await oracle[getAtFunctionName](GRT, 0);

                expect(accumulation.timestamp).to.equal(3);
            });

            it("Should return the correct accumulation when index = 1 and the latest accumulation is at the start of the buffer", async function () {
                await oracle[setCapacityFunctionName](GRT, 2);

                // Push capacity + 1 accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);
                await oracle.stubPush(GRT, 3, 3, 3, 3, 3);

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(2);

                const accumulation = await oracle[getAtFunctionName](GRT, 1);

                expect(accumulation.timestamp).to.equal(2);
            });

            it("Should return the correct accumulation when index = 1 and the latest accumulation is at the end of the buffer", async function () {
                await oracle[setCapacityFunctionName](GRT, 2);

                // Push capacity accumulations
                await oracle.stubPush(GRT, 1, 1, 1, 1, 1);
                await oracle.stubPush(GRT, 2, 2, 2, 2, 2);

                // Sanity check the count
                expect(await oracle[getCountFunctionName](GRT)).to.equal(2);

                const accumulation = await oracle[getAtFunctionName](GRT, 1);

                expect(accumulation.timestamp).to.equal(1);
            });
        });
    });
}

describeHistoricalAccumulationOracleTests("Price");
