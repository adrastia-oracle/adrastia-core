const { expect } = require("chai");
const { ethers } = require("hardhat");

const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const uniswapV2InitCodeHash = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;
const PERIOD = 100;

describe("ManagedUniswapV2Oracle#update", function () {
    var oracle;

    beforeEach(async () => {
        const liquidityAccumulatorFactory = await ethers.getContractFactory("UniswapV2LiquidityAccumulator");
        const liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            uniswapV2FactoryAddress,
            uniswapV2InitCodeHash,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        // Initialize liquidity accumulator
        await liquidityAccumulator.update(WETH);

        const oracleFactory = await ethers.getContractFactory("ManagedUniswapV2Oracle");

        oracle = await oracleFactory.deploy(
            liquidityAccumulator.address,
            uniswapV2FactoryAddress,
            uniswapV2InitCodeHash,
            USDC,
            PERIOD
        );
    });

    it("Owner can update", async function () {
        expect(await oracle.update(WETH)).to.emit(oracle, "Updated");
    });

    it("Non-owner cannot update", async function () {
        const [, addr1] = await ethers.getSigners();

        await expect(oracle.connect(addr1).update(WETH)).to.be.reverted;
    });
});
