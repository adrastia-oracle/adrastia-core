const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

describe("CurvePriceAccumulator#constructor", function () {
    var curvePool;

    var quoteToken;
    var token;
    var invalidToken;

    beforeEach(async () => {
        // Create tokens
        const erc20Factory = await ethers.getContractFactory("FakeERC20");

        token = await erc20Factory.deploy("Token", "T", 18);
        quoteToken = await erc20Factory.deploy("Quote Token", "QT", 18);
        invalidToken = await erc20Factory.deploy("Invalid Token", "IT", 18);

        await token.deployed();
        await quoteToken.deployed();
        await invalidToken.deployed();

        // Deploy the curve pool
        const poolFactory = await ethers.getContractFactory("CurvePoolStub");
        curvePool = await poolFactory.deploy([token.address, quoteToken.address]);
        await curvePool.deployed();
    });

    it("Should revert when given a quote token not in the pool", async function () {
        const accumulatorFactory = await ethers.getContractFactory("CurvePriceAccumulator");
        await expect(
            accumulatorFactory.deploy(curvePool.address, 2, invalidToken.address, TWO_PERCENT_CHANGE, 1, 100)
        ).to.be.revertedWith("CurvePriceAccumulator: INVALID_QUOTE_TOKEN");
    });
});

describe("CurvePriceAccumulator#canUpdate", function () {
    this.timeout(100000);

    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var curvePool;
    var accumulator;

    var quoteToken;
    var token;

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

        // Deploy accumulator
        const accumulatorFactory = await ethers.getContractFactory("CurvePriceAccumulator");
        accumulator = await accumulatorFactory.deploy(
            curvePool.address,
            2,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
    });

    it("Should return false when given an invalid token", async function () {
        expect(await accumulator.canUpdate(GRT)).to.equal(false);
    });

    it("Should return true when given a valid token", async function () {
        expect(await accumulator.canUpdate(token.address)).to.equal(true);
    });
});

describe("CurvePriceAccumulator#fetchPrice", function () {
    this.timeout(100000);

    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var curvePool;
    var accumulator;

    var quoteToken;
    var token;

    const rates = [
        BigNumber.from(0),
        BigNumber.from(1),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000.0", 18),
    ];

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

        // Deploy accumulator
        const accumulatorFactory = await ethers.getContractFactory("CurvePriceAccumulatorStub");
        accumulator = await accumulatorFactory.deploy(
            curvePool.address,
            2,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
    });

    it("Should revert when given an invalid token", async function () {
        await expect(accumulator.harnessFetchPrice(GRT)).to.be.revertedWith("CurvePriceAccumulator: INVALID_TOKEN");
    });

    for (const rate of rates) {
        it("price = " + rate, async function () {
            await curvePool.stubSetRate(token.address, quoteToken.address, rate);

            const price = await accumulator.harnessFetchPrice(token.address);

            if (rate == 0) {
                // 1 is reported rather than 0 because contracts may assume a price of 0 to be invalid
                expect(price).to.equal(1);
            } else {
                expect(price).to.equal(rate);
            }
        });
    }
});
