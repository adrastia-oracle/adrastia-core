const { expect } = require("chai");
const { ethers } = require("hardhat");

const uniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const uniswapV3InitCodeHash = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;
const POOL_FEES = [3000];
const PERIOD = 100;

describe("ManagedUniswapV3Oracle#update", function () {
    var oracle;

    beforeEach(async () => {
        const liquidityAccumulatorFactory = await ethers.getContractFactory("UniswapV3LiquidityAccumulator");
        const liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            uniswapV3FactoryAddress,
            uniswapV3InitCodeHash,
            POOL_FEES,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        // Initialize liquidity accumulator
        await liquidityAccumulator.update(WETH);

        const oracleFactory = await ethers.getContractFactory("ManagedUniswapV3Oracle");

        oracle = await oracleFactory.deploy(
            liquidityAccumulator.address,
            uniswapV3FactoryAddress,
            uniswapV3InitCodeHash,
            POOL_FEES,
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
