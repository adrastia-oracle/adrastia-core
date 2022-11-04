const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

describe("CurveLiquidityAccumulator#constructor", function () {
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

    it("Should revert when given a [pool] quote token is not in the pool (our quote token is invalid)", async function () {
        const accumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulator");
        await expect(
            accumulatorFactory.deploy(
                curvePool.address,
                2,
                invalidToken.address, // pool quote token
                invalidToken.address, // our quote token
                TWO_PERCENT_CHANGE,
                1,
                100
            )
        ).to.be.revertedWith("CurveLiquidityAccumulator: INVALID_QUOTE_TOKEN");
    });

    it("Should revert when given a [pool] quote token is not in the pool (our quote token is valid)", async function () {
        const accumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulator");
        await expect(
            accumulatorFactory.deploy(
                curvePool.address,
                2,
                invalidToken.address, // pool quote token
                quoteToken.address, // our quote token
                TWO_PERCENT_CHANGE,
                1,
                100
            )
        ).to.be.revertedWith("CurveLiquidityAccumulator: INVALID_QUOTE_TOKEN");
    });

    it("Should set our quote token properly with a different pool quote token", async function () {
        const accumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulator");
        const accumulator = await accumulatorFactory.deploy(
            curvePool.address,
            2,
            quoteToken.address, // pool quote token
            invalidToken.address, // our quote token
            TWO_PERCENT_CHANGE,
            1,
            100
        );

        expect(await accumulator.quoteToken()).equals(invalidToken.address);
    });

    it("Should revert when the max update delay is less than the min update delay", async function () {
        const accumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulator");
        await expect(
            accumulatorFactory.deploy(
                curvePool.address,
                2,
                quoteToken.address, // pool quote token
                quoteToken.address, // our quote token
                TWO_PERCENT_CHANGE,
                100, // min update delay
                99 // max update delay
            )
        ).to.be.revertedWith("LiquidityAccumulator: INVALID_UPDATE_DELAYS");
    });
});

describe("CurveLiquidityAccumulator#canUpdate", function () {
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
        const accumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulator");
        accumulator = await accumulatorFactory.deploy(
            curvePool.address,
            2,
            quoteToken.address,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
    });

    it("Should return false when given an invalid token", async function () {
        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });

    it("Should return true when given a valid token", async function () {
        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(token.address, 32))).to.equal(true);
    });
});

describe("CurveLiquidityAccumulator#fetchLiquidity", function () {
    this.timeout(100000);

    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var curvePool;
    var accumulator;

    var quoteToken;
    var token;

    const tests = [
        { args: [ethers.utils.parseUnits("10000", 18), ethers.utils.parseUnits("10000", 18)] },
        { args: [ethers.utils.parseUnits("100000", 18), ethers.utils.parseUnits("10000", 18)] },
        { args: [ethers.utils.parseUnits("10000", 18), ethers.utils.parseUnits("100000", 18)] },
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
        const accumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulatorStub");
        accumulator = await accumulatorFactory.deploy(
            curvePool.address,
            2,
            quoteToken.address,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
    });

    it("Should revert when given an invalid token", async function () {
        await expect(accumulator.harnessFetchLiquidity(GRT)).to.be.revertedWith(
            "CurveLiquidityAccumulator: INVALID_TOKEN"
        );
    });

    tests.forEach(({ args }) => {
        it(`Should get liquidities {tokenLiqudity = ${args[0]}, quoteTokenLiquidity = ${args[1]}}`, async () => {
            await curvePool.stubSetBalance(token.address, args[0]);
            await curvePool.stubSetBalance(quoteToken.address, args[1]);

            const [tokenLiquidity, quoteTokenLiquidity] = await accumulator.harnessFetchLiquidity(token.address);

            expect(tokenLiquidity).to.equal(
                BigNumber.from(args[0].div(BigNumber.from(10).pow(await token.decimals())))
            );
            expect(quoteTokenLiquidity).to.equal(
                BigNumber.from(args[1].div(BigNumber.from(10).pow(await quoteToken.decimals())))
            );
        });
    });
});
