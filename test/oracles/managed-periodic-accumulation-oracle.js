const { expect } = require("chai");
const { ethers } = require("hardhat");

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;
const PERIOD = 100;

describe("ManagedPeriodicAccumulationOracle#update", function () {
    var oracle;

    beforeEach(async () => {
        // Deploy the curve pool
        const poolFactory = await ethers.getContractFactory("CurvePoolStub");
        const curvePool = await poolFactory.deploy([WETH, USDC]);
        await curvePool.deployed();

        // Deploy liquidity accumulator
        const liquidityAccumulatorFactory = await ethers.getContractFactory("CurveLiquidityAccumulatorStub");
        const liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            curvePool.address,
            2,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        // Initialize liquidity accumulator
        await liquidityAccumulator.update(WETH);

        // Deploy price accumulator
        const priceAccumulatorFactory = await ethers.getContractFactory("CurvePriceAccumulatorStub");
        const priceAccumulator = await priceAccumulatorFactory.deploy(
            curvePool.address,
            2,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await priceAccumulator.deployed();

        // Initialize price accumulator
        await priceAccumulator.update(WETH);

        // Deploy oracle
        const oracleFactory = await ethers.getContractFactory("ManagedPeriodicAccumulationOracle");
        oracle = await oracleFactory.deploy(liquidityAccumulator.address, priceAccumulator.address, WETH, 1);
    });

    it("Owner can update", async function () {
        expect(await oracle.update(WETH)).to.emit(oracle, "Updated");
    });

    it("Non-owner cannot update", async function () {
        const [, addr1] = await ethers.getSigners();

        await expect(oracle.connect(addr1).update(WETH)).to.be.reverted;
    });
});
