const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const PERIOD = 100;

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
describe("PeriodicAccumulationOracle#constructor", async function () {
    var oracleFactory;

    var tests = [];

    const testPermutations = [
        [AddressZero, USDC], // liquidityAccumulator
        [AddressZero, USDC], // priceAccumulator
        [AddressZero, USDC], // quoteToken
        [(BigNumber.from(1), BigNumber.from(100))], // period
    ];

    for (const combo of combos(testPermutations)) {
        tests.push({
            args: {
                liquidityAccumulator: combo[0],
                priceAccumulator: combo[1],
                quoteToken: combo[2],
                period: combo[3],
            },
        });
    }

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracle");
    });

    tests.forEach(({ args }) => {
        it(`Should construct the oracle correctly with params ${JSON.stringify(args)}`, async () => {
            const oracle = await oracleFactory.deploy(
                args["liquidityAccumulator"],
                args["priceAccumulator"],
                args["quoteToken"],
                args["period"]
            );

            expect(await oracle.liquidityAccumulator()).to.equal(args["liquidityAccumulator"]);
            expect(await oracle.priceAccumulator()).to.equal(args["priceAccumulator"]);
            expect(await oracle.quoteToken()).to.equal(args["quoteToken"]);
            expect(await oracle.quoteTokenAddress()).to.equal(args["quoteToken"]);
            expect(await oracle.period()).to.equal(args["period"]);

            if (args["quoteToken"] === USDC) {
                expect(await oracle.quoteTokenName()).to.equal("USD Coin");
                expect(await oracle.quoteTokenSymbol()).to.equal("USDC");
                expect(await oracle.quoteTokenDecimals()).to.equal(6);
            }
        });
    });

    it("Should revert if the period is zero", async function () {
        await expect(oracleFactory.deploy(AddressZero, AddressZero, USDC, 0)).to.be.revertedWith(
            "PeriodicOracle: INVALID_PERIOD"
        );
    });
});

describe("PeriodicAccumulationOracle#liquidityDecimals", function () {
    async function doTest(liquidityDecimals) {
        const laFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        const la = await laFactory.deploy(USDC, 100, 100, 100);
        await la.deployed();

        await la.stubSetLiquidityDecimals(liquidityDecimals);

        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracle");
        const oracle = await oracleFactory.deploy(la.address, AddressZero, USDC, 100);

        expect(await oracle.liquidityDecimals()).to.equal(liquidityDecimals);
    }

    it("Should return 0 when the LA uses 0 liquidity decimals", async function () {
        await doTest(0);
    });

    it("Should return 4 when the LA uses 4 liquidity decimals", async function () {
        await doTest(4);
    });

    it("Should return 6 when the LA uses 6 liquidity decimals", async function () {
        await doTest(6);
    });

    it("Should return 18 when the LA uses 18 liquidity decimals", async function () {
        await doTest(18);
    });
});

describe("PeriodicAccumulationOracle#needsUpdate", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, AddressZero, PERIOD);

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

describe("PeriodicAccumulationOracle#canUpdate", function () {
    const MIN_UPDATE_DELAY = 1;
    const MAX_UPDATE_DELAY = 60;
    const TWO_PERCENT_CHANGE = 2000000;

    var priceAccumulator;
    var liquidityAccumulator;
    var oracle;

    var accumulatorUpdateDelayTolerance;

    beforeEach(async () => {
        const paFactory = await ethers.getContractFactory("PriceAccumulatorStub");
        const laFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        priceAccumulator = await paFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);
        liquidityAccumulator = await laFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);

        await priceAccumulator.deployed();
        await liquidityAccumulator.deployed();

        oracle = await oracleFactory.deploy(liquidityAccumulator.address, priceAccumulator.address, USDC, PERIOD);

        accumulatorUpdateDelayTolerance = await oracle.accumulatorUpdateDelayTolerance();
    });

    it("Can update when it needs an update and both of the accumulators have been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when the price accumulator needs an update but it's been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when the liquidity accumulator needs an update but it's been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, true);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when both of the accumulators need an update but it's been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await liquidityAccumulator.overrideNeedsUpdate(true, true);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when both of the accumulators need an update but they're within their grace periods", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber() - 10;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await liquidityAccumulator.overrideNeedsUpdate(true, true);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        // Sanity check: both accumulators are in their grace periods
        expect(checkAt).to.be.greaterThan(updatedAt + MAX_UPDATE_DELAY);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when both of the accumulators need an update but the price accumulator is in its grace period, and the liquidity accumulator was updated recently", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber() - 10;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await liquidityAccumulator.overrideNeedsUpdate(true, true);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, checkAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, checkAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        // Sanity check: price accumulator is in its grace period
        expect(checkAt).to.be.greaterThan(updatedAt + MAX_UPDATE_DELAY);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can update when both of the accumulators need an update but the liquidity accumulator is in its grace period, and the price accumulator was updated recently", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber() - 10;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await liquidityAccumulator.overrideNeedsUpdate(true, true);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, checkAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, checkAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        // Sanity check: liquidity accumulator is in its grace period
        expect(checkAt).to.be.greaterThan(updatedAt + MAX_UPDATE_DELAY);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Can't update when it needs an update but both of the accumulators haven't been initialized", async function () {
        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await oracle.overrideNeedsUpdate(true, true);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it needs an update but the price accumulator hasn't been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: liquidity accumulator is up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it needs an update but the liquidity accumulator hasn't been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: price accumulator is up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it doesn't needs an update and both of the accumulators have been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, false);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it doesn't need an update and both of the accumulators haven't been initialized", async function () {
        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await oracle.overrideNeedsUpdate(true, false);

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it doesn't need an update and the price accumulator hasn't been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, false);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: liquidity accumulator is up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when it doesn't need an update and the liquidity accumulator hasn't been initialized", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, false);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: price accumulator is up-to-date
        expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when the price accumulator needs an update and hasn't been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber() + 10;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await liquidityAccumulator.overrideNeedsUpdate(true, false);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.greaterThanOrEqual(
            updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber()
        );

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when the liquidity accumulator needs an update and hasn't been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber() + 10;

        await priceAccumulator.overrideNeedsUpdate(true, false);
        await liquidityAccumulator.overrideNeedsUpdate(true, true);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.greaterThanOrEqual(
            updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber()
        );

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Can't update when the both of the accumulators need an update and haven't been updated within the last period", async function () {
        const updatedAt = (await currentBlockTimestamp()) + 240;
        const checkAt = updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber() + 10;

        await priceAccumulator.overrideNeedsUpdate(true, true);
        await liquidityAccumulator.overrideNeedsUpdate(true, true);

        await priceAccumulator.stubSetAccumulation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetAccumulation(AddressZero, 1, 1, updatedAt);

        await priceAccumulator.stubSetObservation(AddressZero, 1, updatedAt);
        await liquidityAccumulator.stubSetObservation(AddressZero, 1, 1, updatedAt);

        await oracle.overrideNeedsUpdate(true, true);

        await hre.timeAndMine.setTime(checkAt);

        // Sanity check: both accumulators are up-to-date
        expect(checkAt).to.be.greaterThanOrEqual(
            updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber()
        );

        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });
});

describe("PeriodicAccumulationOracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, USDC, PERIOD);
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

describe("PeriodicAccumulationOracle#consultPrice(token, maxAge = 0)", function () {
    const MIN_UPDATE_DELAY = 1;
    const MAX_UPDATE_DELAY = 2;
    const TWO_PERCENT_CHANGE = 2000000;

    var priceAccumulator;
    var liquidityAccumulator;
    var oracle;

    beforeEach(async () => {
        const paFactory = await ethers.getContractFactory("PriceAccumulatorStub");
        const laFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracle");

        priceAccumulator = await paFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);
        liquidityAccumulator = await laFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);

        await priceAccumulator.deployed();
        await liquidityAccumulator.deployed();

        oracle = await oracleFactory.deploy(liquidityAccumulator.address, priceAccumulator.address, USDC, PERIOD);
    });

    it("Should get the set price (=1)", async () => {
        const price = BigNumber.from(1);
        const tokenLiquidity = BigNumber.from(1);
        const quoteTokenLiquidity = BigNumber.from(1);

        await priceAccumulator.setPrice(AddressZero, price);
        await liquidityAccumulator.setLiquidity(AddressZero, tokenLiquidity, quoteTokenLiquidity);

        expect(await oracle["consultPrice(address,uint256)"](AddressZero, 0)).to.equal(price);
    });
});

describe("PeriodicAccumulationOracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, USDC, PERIOD);

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

describe("PeriodicAccumulationOracle#consultLiquidity(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, USDC, PERIOD);
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

describe("PeriodicAccumulationOracle#consultLiquidity(token, maxAge = 0)", function () {
    const MIN_UPDATE_DELAY = 1;
    const MAX_UPDATE_DELAY = 2;
    const TWO_PERCENT_CHANGE = 2000000;

    var priceAccumulator;
    var liquidityAccumulator;
    var oracle;

    beforeEach(async () => {
        const paFactory = await ethers.getContractFactory("PriceAccumulatorStub");
        const laFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracle");

        priceAccumulator = await paFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);
        liquidityAccumulator = await laFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);

        await priceAccumulator.deployed();
        await liquidityAccumulator.deployed();

        oracle = await oracleFactory.deploy(liquidityAccumulator.address, priceAccumulator.address, USDC, PERIOD);
    });

    it("Should get the set liquidities (2,3)", async () => {
        const price = BigNumber.from(1);
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await priceAccumulator.setPrice(AddressZero, price);
        await liquidityAccumulator.setLiquidity(AddressZero, tokenLiquidity, quoteTokenLiquidity);

        const liquidity = await oracle["consultLiquidity(address,uint256)"](AddressZero, 0);

        expect(liquidity["tokenLiquidity"]).to.equal(tokenLiquidity);
        expect(liquidity["quoteTokenLiquidity"]).to.equal(quoteTokenLiquidity);
    });
});

describe("PeriodicAccumulationOracle#consultLiquidity(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, USDC, PERIOD);

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

describe("PeriodicAccumulationOracle#consult(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, USDC, PERIOD);
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

describe("PeriodicAccumulationOracle#consult(token, maxAge = 0)", function () {
    const MIN_UPDATE_DELAY = 1;
    const MAX_UPDATE_DELAY = 2;
    const TWO_PERCENT_CHANGE = 2000000;

    var priceAccumulator;
    var liquidityAccumulator;
    var oracle;

    beforeEach(async () => {
        const paFactory = await ethers.getContractFactory("PriceAccumulatorStub");
        const laFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracle");

        priceAccumulator = await paFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);
        liquidityAccumulator = await laFactory.deploy(USDC, TWO_PERCENT_CHANGE, MIN_UPDATE_DELAY, MAX_UPDATE_DELAY);

        await priceAccumulator.deployed();
        await liquidityAccumulator.deployed();

        oracle = await oracleFactory.deploy(liquidityAccumulator.address, priceAccumulator.address, USDC, PERIOD);
    });

    it("Should get the set price (1) and liquidities (2,3)", async () => {
        const price = BigNumber.from(1);
        const tokenLiquidity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await priceAccumulator.setPrice(AddressZero, price);
        await liquidityAccumulator.setLiquidity(AddressZero, tokenLiquidity, quoteTokenLiquidity);

        const consultation = await oracle["consult(address,uint256)"](AddressZero, 0);

        expect(consultation["price"]).to.equal(price);
        expect(consultation["tokenLiquidity"]).to.equal(tokenLiquidity);
        expect(consultation["quoteTokenLiquidity"]).to.equal(quoteTokenLiquidity);
    });
});

describe("PeriodicAccumulationOracle#consult(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, USDC, PERIOD);

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

describe("PeriodicAccumulationOracle#update", function () {
    this.timeout(100000);

    const MIN_UPDATE_DELAY = 1;
    const MAX_UPDATE_DELAY = 60;
    const TWO_PERCENT_CHANGE = 2000000;

    var quoteToken;
    var token;

    var curvePool;
    var liquidityAccumulator;
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
        // Deploy liquidity accumulator
        const liquidityAccumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulatorStub");
        liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            curvePool.address,
            2,
            quoteToken.address,
            quoteToken.address,
            0, // Liquidity decimals
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        // Deploy price accumulator
        const priceAccumulatorFactory = await ethers.getContractFactory("CurvePriceAccumulatorStub");
        priceAccumulator = await priceAccumulatorFactory.deploy(
            curvePool.address,
            2,
            quoteToken.address,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await priceAccumulator.deployed();

        // Deploy oracle
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");
        oracle = await oracleFactory.deploy(
            liquidityAccumulator.address,
            priceAccumulator.address,
            quoteToken.address,
            1
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

        expectedTokenLiquidity = tokenLiquidity.div(BigNumber.from(10).pow(await token.decimals()));
        expectedQuoteTokenLiquidity = quoteTokenLiquidity.div(BigNumber.from(10).pow(await quoteToken.decimals()));
        expectedPrice = price;
    }

    describe("Reverts when", function () {
        beforeEach(async () => {
            // We need PriceAccumulatorStub and LiquidityAccumulatorStub rather than the curve accumulator stubs

            // Deploy liquidity accumulator
            const liquidityAccumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
            liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
                quoteToken.address,
                TWO_PERCENT_CHANGE,
                MIN_UPDATE_DELAY,
                MAX_UPDATE_DELAY
            );
            await liquidityAccumulator.deployed();

            // Deploy price accumulator
            const priceAccumulatorFactory = await ethers.getContractFactory("PriceAccumulatorStub");
            priceAccumulator = await priceAccumulatorFactory.deploy(
                quoteToken.address,
                TWO_PERCENT_CHANGE,
                MIN_UPDATE_DELAY,
                MAX_UPDATE_DELAY
            );
            await priceAccumulator.deployed();

            // Deploy oracle
            const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");
            oracle = await oracleFactory.deploy(
                liquidityAccumulator.address,
                priceAccumulator.address,
                quoteToken.address,
                1
            );
        });

        it("Price accumulator is out-of-date", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt;

            await priceAccumulator.overrideNeedsUpdate(true, true);
            await liquidityAccumulator.overrideNeedsUpdate(true, false);

            await liquidityAccumulator.stubSetAccumulation(token.address, 1, 1, updatedAt);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: liquidity accumulator is up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await expect(oracle.update(updateData)).to.be.revertedWith(
                "PeriodicAccumulationOracle: PRICE_ACCUMULATOR_NEEDS_UPDATE"
            );
        });

        it("Liquidity accumulator is out-of-date", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt;

            await priceAccumulator.overrideNeedsUpdate(true, false);
            await liquidityAccumulator.overrideNeedsUpdate(true, true);

            await priceAccumulator.stubSetAccumulation(token.address, 1, updatedAt);
            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: price accumulator is up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await expect(oracle.update(updateData)).to.be.revertedWith(
                "PeriodicAccumulationOracle: LIQUIDITY_ACCUMULATOR_NEEDS_UPDATE"
            );
        });

        it("Price and liquidity accumulators are out-of-date", async function () {
            await priceAccumulator.overrideNeedsUpdate(true, true);
            await liquidityAccumulator.overrideNeedsUpdate(true, true);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await expect(oracle.update(updateData)).to.be.revertedWith(
                "PeriodicAccumulationOracle: PRICE_ACCUMULATOR_NEEDS_UPDATE"
            );
        });
    });

    describe("Doesn't revert when", function () {
        beforeEach(async () => {
            // We need PriceAccumulatorStub and LiquidityAccumulatorStub rather than the curve accumulator stubs

            // Deploy liquidity accumulator
            const liquidityAccumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
            liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
                quoteToken.address,
                TWO_PERCENT_CHANGE,
                MIN_UPDATE_DELAY,
                MAX_UPDATE_DELAY
            );
            await liquidityAccumulator.deployed();

            // Deploy price accumulator
            const priceAccumulatorFactory = await ethers.getContractFactory("PriceAccumulatorStub");
            priceAccumulator = await priceAccumulatorFactory.deploy(
                quoteToken.address,
                TWO_PERCENT_CHANGE,
                MIN_UPDATE_DELAY,
                MAX_UPDATE_DELAY
            );
            await priceAccumulator.deployed();

            // Deploy oracle
            const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");
            oracle = await oracleFactory.deploy(
                liquidityAccumulator.address,
                priceAccumulator.address,
                quoteToken.address,
                600 // 10 minutes
            );
        });

        it("Price accumulator needs an update but it's been updated within the last period", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt;

            await priceAccumulator.overrideNeedsUpdate(true, true);
            await liquidityAccumulator.overrideNeedsUpdate(true, false);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            await expect(oracle.update(updateData)).to.not.be.reverted;
        });

        it("Liquidity accumulator needs an update but it's been updated within the last period", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt;

            await priceAccumulator.overrideNeedsUpdate(true, false);
            await liquidityAccumulator.overrideNeedsUpdate(true, true);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            await expect(oracle.update(updateData)).to.not.be.reverted;
        });

        it("Price and liquidity accumulators need an update but they've been updated within the last period", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt;

            await priceAccumulator.overrideNeedsUpdate(true, true);
            await liquidityAccumulator.overrideNeedsUpdate(true, true);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            await expect(oracle.update(updateData)).to.not.be.reverted;
        });
    });

    describe("Return value differences with different accumulations", function () {
        beforeEach(async () => {
            // We need PriceAccumulatorStub and LiquidityAccumulatorStub rather than the curve accumulator stubs

            // Deploy liquidity accumulator
            const liquidityAccumulatorFactory = await ethers.getContractFactory("LiquidityAccumulatorStub");
            liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
                quoteToken.address,
                TWO_PERCENT_CHANGE,
                MIN_UPDATE_DELAY,
                MAX_UPDATE_DELAY
            );
            await liquidityAccumulator.deployed();

            // Deploy price accumulator
            const priceAccumulatorFactory = await ethers.getContractFactory("PriceAccumulatorStub");
            priceAccumulator = await priceAccumulatorFactory.deploy(
                quoteToken.address,
                TWO_PERCENT_CHANGE,
                MIN_UPDATE_DELAY,
                MAX_UPDATE_DELAY
            );
            await priceAccumulator.deployed();

            // Deploy oracle
            const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");
            oracle = await oracleFactory.deploy(
                liquidityAccumulator.address,
                priceAccumulator.address,
                quoteToken.address,
                1
            );
        });

        it("Should return false when both of the accumulations haven't changed", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt + 1;

            // Set the "last accumulation"
            await oracle.stubSetAccumulations(token.address, 1, 1, 1, updatedAt);

            // Make the accumulators not need an update (i.e. up-to-date)
            await priceAccumulator.overrideNeedsUpdate(true, false);
            await liquidityAccumulator.overrideNeedsUpdate(true, false);

            // Make the accumulators use the last accumulations as the current
            await priceAccumulator.overrideCurrentAccumulation(true);
            await liquidityAccumulator.overrideCurrentAccumulation(true);

            // Set the "current accumulations"
            await priceAccumulator.stubSetAccumulation(token.address, 1, updatedAt);
            await liquidityAccumulator.stubSetAccumulation(token.address, 1, 1, updatedAt);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            expect(await oracle.callStatic.update(updateData)).to.equal(false);
        });

        it("Should return true when the liquidity accumulation has been updated, but the price accumulation has not", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt + 2;

            // Set the "last accumulation"
            await oracle.stubSetAccumulations(token.address, 1, 1, 1, updatedAt);

            // Make the accumulators not need an update (i.e. up-to-date)
            await priceAccumulator.overrideNeedsUpdate(true, false);
            await liquidityAccumulator.overrideNeedsUpdate(true, false);

            // Make the accumulators use the last accumulations as the current
            await priceAccumulator.overrideCurrentAccumulation(true);
            await liquidityAccumulator.overrideCurrentAccumulation(true);

            // Set the "current accumulations"
            await priceAccumulator.stubSetAccumulation(token.address, 1, updatedAt);
            await liquidityAccumulator.stubSetAccumulation(token.address, 1, 1, updatedAt + 1);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt + 1);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            expect(await oracle.callStatic.update(updateData)).to.equal(true);
        });

        it("Should return true when the price accumulation has been updated, but the liquidity accumulation has not", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt + 2;

            // Set the "last accumulation"
            await oracle.stubSetAccumulations(token.address, 1, 1, 1, updatedAt);

            // Make the accumulators not need an update (i.e. up-to-date)
            await priceAccumulator.overrideNeedsUpdate(true, false);
            await liquidityAccumulator.overrideNeedsUpdate(true, false);

            // Make the accumulators use the last accumulations as the current
            await priceAccumulator.overrideCurrentAccumulation(true);
            await liquidityAccumulator.overrideCurrentAccumulation(true);

            // Set the "current accumulations"
            await priceAccumulator.stubSetAccumulation(token.address, 1, updatedAt + 1);
            await liquidityAccumulator.stubSetAccumulation(token.address, 1, 1, updatedAt);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt + 1);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

            const updateData = ethers.utils.hexZeroPad(token.address, 32);

            expect(await oracle.callStatic.update(updateData)).to.equal(true);
        });

        it("Should return true when the both the price and the liquidity accumulations have been updated", async function () {
            const updatedAt = (await currentBlockTimestamp()) + 240;
            const checkAt = updatedAt + 2;

            // Set the "last accumulation"
            await oracle.stubSetAccumulations(token.address, 1, 1, 1, updatedAt);

            // Make the accumulators not need an update (i.e. up-to-date)
            await priceAccumulator.overrideNeedsUpdate(true, false);
            await liquidityAccumulator.overrideNeedsUpdate(true, false);

            // Make the accumulators use the last accumulations as the current
            await priceAccumulator.overrideCurrentAccumulation(true);
            await liquidityAccumulator.overrideCurrentAccumulation(true);

            // Set the "current accumulations"
            await priceAccumulator.stubSetAccumulation(token.address, 1, updatedAt + 1);
            await liquidityAccumulator.stubSetAccumulation(token.address, 1, 1, updatedAt + 1);

            await priceAccumulator.stubSetObservation(token.address, 1, updatedAt + 1);
            await liquidityAccumulator.stubSetObservation(token.address, 1, 1, updatedAt + 1);

            // Ensures the oracle will try and perform the update
            await oracle.overrideNeedsUpdate(true, true);

            await hre.timeAndMine.setTime(checkAt);

            // Sanity check: both accumulators are up-to-date
            expect(checkAt).to.be.lessThan(updatedAt + MAX_UPDATE_DELAY + accumulatorUpdateDelayTolerance.toNumber());

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
        await liquidityAccumulator.update(updateData);
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

        const [oPrice, oTokenLiqudity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token.address);

        expect(oPrice, "Observation price").to.equal(fakePrice);
        expect(oTokenLiqudity, "Observation token liquidity").to.equal(fakeTokenLiquidity);
        expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(fakeQuoteTokenLiquidity);
        expect(oTimestamp, "Observation timestamp").to.equal(fakeObservationTimestamp);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [cumulativeTokenLiquidity, cumulativeQuoteTokenLiquidity, cumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        expect(cumulativePrice, "Cumulative price").to.equal(fakePrice);
        expect(cumulativeTokenLiquidity, "Cumulative token liquidity").to.equal(fakeTokenLiquidity);
        expect(cumulativeQuoteTokenLiquidity, "Cumulative quote token liquidity").to.equal(fakeQuoteTokenLiquidity);
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.equal(fakeAccumulationTimestamp);
        expect(cumulativeLiquidityTimestamp, "Liquidity accumulation timestamp").to.equal(fakeAccumulationTimestamp);
    });

    it("Shouldn't update observation or emit Updated when both of the last accumulations are too old", async function () {
        // Add liquidity
        await addLiquidity(
            ethers.utils.parseUnits("1000", await token.decimals()),
            ethers.utils.parseUnits("1000", await quoteToken.decimals())
        );

        const updateData = ethers.utils.hexZeroPad(token.address, 32);

        // Update accumulators to initialize the oracle
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        // First update of the oracle
        await oracle.update(updateData);

        const period = await oracle.period();

        // Fast forwward to the next update
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + period.toNumber() + 1);

        // Update everything
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);
        await oracle.update(updateData);

        // Change liquidity and price so that the next oracle update will report different values if the update
        // is performed (it shouldn't be).
        await addLiquidity(
            ethers.utils.parseUnits("100000", await token.decimals()),
            ethers.utils.parseUnits("10000000", await quoteToken.decimals())
        );

        // Fast forward past the minimum update delay
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + MIN_UPDATE_DELAY + 1);

        // Update the accumulators to record the change
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        const updateDelayTolerance = await oracle.updateDelayTolerance();

        // Fast forward past the update delay tolerance
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + updateDelayTolerance.toNumber() + 1);

        // Update accumulators so that we know they won't prevent the oracle from updating
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        // Record old accumulations
        const [oldCumulativePrice, oldCumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [oldCumulativeTokenLiquidity, oldCumulativeQuoteTokenLiquidity, oldCumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        // Record old observation
        const [oldPrice, oldTokenLiquidity, oldQuoteTokenLiquidity, oldTimestamp] = await oracle.observations(
            token.address
        );

        // Now we update the oracle. This should fail as the last price accumulation is too old
        const updateTx = await oracle.update(updateData);

        // Shouldn't emit Updated
        await expect(updateTx).to.not.emit(oracle, "Updated");

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token.address);

        // Observation should not update
        expect(oPrice, "Observation price").to.equal(oldPrice);
        expect(oTokenLiquidity, "Observation token liquidity").to.equal(oldTokenLiquidity);
        expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(oldQuoteTokenLiquidity);
        expect(oTimestamp, "Observation timestamp").to.equal(oldTimestamp);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [cumulativeTokenLiquidity, cumulativeQuoteTokenLiquidity, cumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        // Accumulation should update
        expect(cumulativePrice, "Cumulative price").to.not.equal(oldCumulativePrice);
        expect(cumulativeTokenLiquidity, "Cumulative token liquidity").to.not.equal(oldCumulativeTokenLiquidity);
        expect(cumulativeQuoteTokenLiquidity, "Cumulative quote token liquidity").to.not.equal(
            oldCumulativeQuoteTokenLiquidity
        );
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.not.equal(oldCumulativePriceTimestamp);
        expect(cumulativeLiquidityTimestamp, "Liquidity accumulation timestamp").to.not.equal(
            oldCumulativeLiquidityTimestamp
        );
    });

    it("Shouldn't update observation or emit Updated when the last price accumulation is too old", async function () {
        // Add liquidity
        await addLiquidity(
            ethers.utils.parseUnits("1000", await token.decimals()),
            ethers.utils.parseUnits("1000", await quoteToken.decimals())
        );

        const updateData = ethers.utils.hexZeroPad(token.address, 32);

        // Update accumulators to initialize the oracle
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        // First update of the oracle
        await oracle.update(updateData);

        const period = await oracle.period();

        // Fast forwward to the next update
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + period.toNumber() + 1);

        // Update everything
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);
        await oracle.update(updateData);

        // Change liquidity and price so that the next oracle update will report different values if the update
        // is performed (it shouldn't be).
        await addLiquidity(
            ethers.utils.parseUnits("100000", await token.decimals()),
            ethers.utils.parseUnits("10000000", await quoteToken.decimals())
        );

        // Fast forward past the minimum update delay
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + MIN_UPDATE_DELAY + 1);

        // Update the accumulators to record the change
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        const updateDelayTolerance = await oracle.updateDelayTolerance();

        // Fast forward past the update delay tolerance
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + updateDelayTolerance.toNumber() + 1);

        // Update accumulators so that we know they won't prevent the oracle from updating
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        // Record old accumulations
        const [oldCumulativePrice, oldCumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [oldCumulativeTokenLiquidity, oldCumulativeQuoteTokenLiquidity, oldCumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        // Record old observation
        const [oldPrice, oldTokenLiquidity, oldQuoteTokenLiquidity, oldTimestamp] = await oracle.observations(
            token.address
        );

        // Set the last liquidity accumulation to be fresh
        await oracle.stubSetLiquidityAccumulation(
            token.address,
            oldCumulativeTokenLiquidity,
            oldCumulativeQuoteTokenLiquidity,
            (await currentBlockTimestamp()) - 1
        );

        // Now we update the oracle. This should fail as the last price accumulation is too old
        const updateTx = await oracle.update(updateData);

        // Shouldn't emit Updated
        await expect(updateTx).to.not.emit(oracle, "Updated");

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token.address);

        // Observation should not update
        expect(oPrice, "Observation price").to.equal(oldPrice);
        expect(oTokenLiquidity, "Observation token liquidity").to.equal(oldTokenLiquidity);
        expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(oldQuoteTokenLiquidity);
        expect(oTimestamp, "Observation timestamp").to.equal(oldTimestamp);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [cumulativeTokenLiquidity, cumulativeQuoteTokenLiquidity, cumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        // Accumulation should update
        expect(cumulativePrice, "Cumulative price").to.not.equal(oldCumulativePrice);
        expect(cumulativeTokenLiquidity, "Cumulative token liquidity").to.not.equal(oldCumulativeTokenLiquidity);
        expect(cumulativeQuoteTokenLiquidity, "Cumulative quote token liquidity").to.not.equal(
            oldCumulativeQuoteTokenLiquidity
        );
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.not.equal(oldCumulativePriceTimestamp);
        expect(cumulativeLiquidityTimestamp, "Liquidity accumulation timestamp").to.not.equal(
            oldCumulativeLiquidityTimestamp
        );
    });

    it("Shouldn't update observation or emit Updated when the last liquidity accumulation is too old", async function () {
        // Add liquidity
        await addLiquidity(
            ethers.utils.parseUnits("1000", await token.decimals()),
            ethers.utils.parseUnits("1000", await quoteToken.decimals())
        );

        const updateData = ethers.utils.hexZeroPad(token.address, 32);

        // Update accumulators to initialize the oracle
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        // First update of the oracle
        await oracle.update(updateData);

        const period = await oracle.period();

        // Fast forwward to the next update
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + period.toNumber() + 1);

        // Update everything
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);
        await oracle.update(updateData);

        // Change liquidity and price so that the next oracle update will report different values if the update
        // is performed (it shouldn't be).
        await addLiquidity(
            ethers.utils.parseUnits("100000", await token.decimals()),
            ethers.utils.parseUnits("10000000", await quoteToken.decimals())
        );

        // Fast forward past the minimum update delay
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + MIN_UPDATE_DELAY + 1);

        // Update the accumulators to record the change
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        const updateDelayTolerance = await oracle.updateDelayTolerance();

        // Fast forward past the update delay tolerance
        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + updateDelayTolerance.toNumber() + 1);

        // Update accumulators so that we know they won't prevent the oracle from updating
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        // Record old accumulations
        const [oldCumulativePrice, oldCumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [oldCumulativeTokenLiquidity, oldCumulativeQuoteTokenLiquidity, oldCumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        // Record old observation
        const [oldPrice, oldTokenLiquidity, oldQuoteTokenLiquidity, oldTimestamp] = await oracle.observations(
            token.address
        );

        // Set the last price accumulation to be fresh
        await oracle.stubSetPriceAccumulation(token.address, oldCumulativePrice, (await currentBlockTimestamp()) - 1);

        // Now we update the oracle. This should fail as the last price accumulation is too old
        const updateTx = await oracle.update(updateData);

        // Shouldn't emit Updated
        await expect(updateTx).to.not.emit(oracle, "Updated");

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token.address);

        // Observation should not update
        expect(oPrice, "Observation price").to.equal(oldPrice);
        expect(oTokenLiquidity, "Observation token liquidity").to.equal(oldTokenLiquidity);
        expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(oldQuoteTokenLiquidity);
        expect(oTimestamp, "Observation timestamp").to.equal(oldTimestamp);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [cumulativeTokenLiquidity, cumulativeQuoteTokenLiquidity, cumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        // Accumulation should update
        expect(cumulativePrice, "Cumulative price").to.not.equal(oldCumulativePrice);
        expect(cumulativeTokenLiquidity, "Cumulative token liquidity").to.not.equal(oldCumulativeTokenLiquidity);
        expect(cumulativeQuoteTokenLiquidity, "Cumulative quote token liquidity").to.not.equal(
            oldCumulativeQuoteTokenLiquidity
        );
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.not.equal(oldCumulativePriceTimestamp);
        expect(cumulativeLiquidityTimestamp, "Liquidity accumulation timestamp").to.not.equal(
            oldCumulativeLiquidityTimestamp
        );
    });

    it("Shouldn't update observation timestamp or emit Updated when there's no price", async function () {
        // Add liquidity
        await addLiquidity(
            ethers.utils.parseUnits("1000", await token.decimals()),
            ethers.utils.parseUnits("1000", await quoteToken.decimals())
        );

        const updateData = ethers.utils.hexZeroPad(token.address, 32);

        // Update accumulators
        await liquidityAccumulator.update(updateData);
        await priceAccumulator.update(updateData);

        const updateTx = await oracle.update(updateData);

        // Shouldn't emite Updated since the oracle doesn't have enough info to calculate price
        await expect(updateTx).to.not.emit(oracle, "Updated");

        const [, , , oTimestamp] = await oracle.observations(token.address);

        // Observation timestamp should not update since the oracle doesn't have enough info to calculate price
        expect(oTimestamp, "Observation timestamp").to.equal(0);

        const [cumulativePrice, cumulativePriceTimestamp] = await oracle.priceAccumulations(token.address);
        const [cumulativeTokenLiquidity, cumulativeQuoteTokenLiquidity, cumulativeLiquidityTimestamp] =
            await oracle.liquidityAccumulations(token.address);

        // Accumulation should update
        expect(cumulativePrice, "Cumulative price").to.not.equal(0);
        expect(cumulativeTokenLiquidity, "Cumulative token liquidity").to.not.equal(0);
        expect(cumulativeQuoteTokenLiquidity, "Cumulative quote token liquidity").to.not.equal(0);
        expect(cumulativePriceTimestamp, "Price accumulation timestamp").to.not.equal(0);
        expect(cumulativeLiquidityTimestamp, "Liquidity accumulation timestamp").to.not.equal(0);
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

        const [pPrice, pTokenLiqudity, pQuoteTokenLiquidity, pTimestamp] = await oracle.observations(token.address);

        const updateTxPromise = oracle.update(ethers.utils.hexZeroPad(token.address, 32));

        await expect(updateTxPromise).to.not.emit(oracle, "Updated");

        const [price, tokenLiqudity, quoteTokenLiquidity, timestamp] = await oracle.observations(token.address);

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

        [price, tokenLiquidity, quoteTokenLiquidity, timestamp] = await oracle.observations(token.address);

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

describe("PeriodicAccumulationOracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("PeriodicAccumulationOracleStub");
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, AddressZero, PERIOD);
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

    it("Should support IHasLiquidityAccumulator", async () => {
        const interfaceId = await interfaceIds.iHasLiquidityAccumulator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHasPriceAccumulator", async () => {
        const interfaceId = await interfaceIds.iHasPriceAccumulator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
