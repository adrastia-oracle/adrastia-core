const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;
const bn = require("bignumber.js");

const {
    abi: FACTORY_ABI,
    bytecode: FACTORY_BYTECODE,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");

const {
    abi: POOL_ABI,
    bytecode: POOL_BYTECODE,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

const uniswapV3InitCodeHash = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// returns the sqrt price as a 64x96
// https://github.com/Uniswap/v3-core/blob/c05a0e2c8c08c460fb4d05cfdda30b3ad8deeaac/test/shared/utilities.ts#L63
function encodePriceSqrt(reserve1, reserve0) {
    return BigNumber.from(
        new bn(reserve1.toString())
            .div(reserve0.toString())
            .sqrt()
            .multipliedBy(new bn(2).pow(96))
            .integerValue(3)
            .toString()
    );
}

const TICK_SPACINGS = {
    500: 10,
    3000: 60,
    10000: 200,
};

const getMinTick = (tickSpacing) => Math.ceil(-887272 / tickSpacing) * tickSpacing;
const getMaxTick = (tickSpacing) => Math.floor(887272 / tickSpacing) * tickSpacing;

const TWO_PERCENT_CHANGE = 2000000;
const MIN_UPDATE_DELAY = 10000;
const MAX_UPDATE_DELAY = 30000;

const POOL_FEES = [500, 3000, 10000];

describe("UniswapV3LiquidityAccumulator#fetchLiquidity", function () {
    this.timeout(100000);

    var uniswapFactory;
    var liquidityAccumulator;
    var addressHelper;

    var expectedTokenLiquidity;
    var expectedQuoteTokenLiquidity;
    var expectedPrice;

    var quoteToken;
    var token;
    var ltToken;
    var gtToken;

    const tests = [{ args: [10000, 10000] }, { args: [100000, 10000] }, { args: [10000, 100000] }];

    beforeEach(async () => {
        const erc20Factory = await ethers.getContractFactory("FakeERC20");
        const uniswapFactoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
        const liquidityAccumulatorFactory = await ethers.getContractFactory("UniswapV3LiquidityAccumulatorStub");
        const helperFactory = await ethers.getContractFactory("UniswapV3Helper");
        const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

        addressHelper = await addressHelperFactory.deploy();

        var tokens = [undefined, undefined, undefined];

        for (var i = 0; i < tokens.length; ++i) tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
        for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

        tokens = tokens.sort(async (a, b) => await addressHelper.lessThan(a.address, b.address));

        token = ltToken = tokens[0];
        quoteToken = tokens[1];
        gtToken = tokens[2];

        uniswapFactory = await uniswapFactoryFactory.deploy();
        await uniswapFactory.deployed();

        liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            uniswapFactory.address,
            uniswapV3InitCodeHash,
            POOL_FEES,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        helper = await helperFactory.deploy(uniswapFactory.address, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

        expectedTokenLiquidity = BigNumber.from(0);
        expectedQuoteTokenLiquidity = BigNumber.from(0);
        expectedPrice = BigNumber.from(0);
    });

    async function createPool(sqrtPrice, fee = 3000) {
        await uniswapFactory.createPool(token.address, quoteToken.address, fee);

        const pool = await uniswapFactory.getPool(token.address, quoteToken.address, fee);
        const poolContract = await ethers.getContractAt(POOL_ABI, pool);

        poolContract.initialize(sqrtPrice);
    }

    async function addLiquidity(tokenLiquidity, quoteTokenLiquidity, fee = 3000) {
        const [owner] = await ethers.getSigners();

        var token0;
        var token1;

        var amount0;
        var amount1;

        if (await addressHelper.lessThan(token.address, quoteToken.address)) {
            token0 = token.address;
            token1 = quoteToken.address;

            amount0 = tokenLiquidity;
            amount1 = quoteTokenLiquidity;
        } else {
            token1 = token.address;
            token0 = quoteToken.address;

            amount1 = tokenLiquidity;
            amount0 = quoteTokenLiquidity;
        }

        const params = {
            token0: token0,
            token1: token1,
            fee: fee,
            recipient: owner.address,
            tickLower: getMinTick(TICK_SPACINGS[fee]),
            tickUpper: getMaxTick(TICK_SPACINGS[fee]),
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0,
            amount1Min: 0,
        };

        await token.approve(helper.address, MaxUint256);
        await quoteToken.approve(helper.address, MaxUint256);

        const [, rAmount0, rAmount1] = await helper.callStatic.helperAddLiquidity(params);

        await helper.helperAddLiquidity(params);

        if (await addressHelper.lessThan(token.address, quoteToken.address)) {
            expectedTokenLiquidity = expectedTokenLiquidity.add(rAmount0);
            expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(rAmount1);
        } else {
            expectedTokenLiquidity = expectedTokenLiquidity.add(rAmount1);
            expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(rAmount0);
        }

        const decimalFactor = BigNumber.from(10).pow(await token.decimals());
        const precisionFactor = BigNumber.from(10).pow(6);

        expectedPrice = expectedQuoteTokenLiquidity
            .mul(precisionFactor)
            .mul(decimalFactor)
            .div(expectedTokenLiquidity)
            .div(precisionFactor);
    }

    it("Shouldn't revert when there are no pools", async function () {
        await expect(liquidityAccumulator.harnessFetchLiquidity(token.address)).to.not.be.reverted;
    });

    it("Should revert if token == quoteToken", async function () {
        await expect(liquidityAccumulator.harnessFetchLiquidity(quoteToken.address)).to.be.reverted;
    });

    it("Should revert if token == address(0)", async function () {
        await expect(liquidityAccumulator.harnessFetchLiquidity(AddressZero)).to.be.reverted;
    });

    function liquidityTests(poolFees) {
        tests.forEach(({ args }) => {
            it(`Should get liquidities {tokenLiqudity = ${args[0]}, quoteTokenLiquidity = ${args[1]}}`, async () => {
                const sqrtPrice = (await addressHelper.lessThan(token.address, quoteToken.address))
                    ? encodePriceSqrt(args[1], args[0])
                    : encodePriceSqrt(args[0], args[1]);

                var tokenLiquiditySum = BigNumber.from(0);
                var quoteTokenLiquiditySum = BigNumber.from(0);

                for (fee of poolFees) {
                    await createPool(sqrtPrice, fee);
                    await addLiquidity(args[0], args[1], fee);

                    tokenLiquiditySum = tokenLiquiditySum.add(args[0]);
                    quoteTokenLiquiditySum = quoteTokenLiquiditySum.add(args[1]);
                }

                const [tokenLiquidity, quoteTokenLiquidity] = await liquidityAccumulator.harnessFetchLiquidity(
                    token.address
                );

                // Verify liquidities based off what our helper reports
                expect(tokenLiquidity).to.equal(expectedTokenLiquidity);
                expect(quoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);

                // Verify liquidities based off our input
                {
                    // Allow 1% difference to account for fees and Uniswap math precision loss
                    const expectedTokenLiquidityFloor = tokenLiquiditySum.sub(tokenLiquiditySum.div(100));
                    const expectedTokenLiquidityCeil = tokenLiquiditySum.add(tokenLiquiditySum.div(100));

                    const expectedQuoteTokenLiquidityFloor = quoteTokenLiquiditySum.sub(
                        quoteTokenLiquiditySum.div(100)
                    );
                    const expectedQuoteTokenLiquidityCeil = quoteTokenLiquiditySum.add(quoteTokenLiquiditySum.div(100));

                    expect(tokenLiquidity).to.be.within(expectedTokenLiquidityFloor, expectedTokenLiquidityCeil);
                    expect(quoteTokenLiquidity).to.be.within(
                        expectedQuoteTokenLiquidityFloor,
                        expectedQuoteTokenLiquidityCeil
                    );
                }
            });
        });
    }

    describe("Providing liquidity for poolFees = [ 500 ]", function () {
        liquidityTests([500]);
    });

    describe("Providing liquidity for poolFees = [ 500, 3000 ]", function () {
        liquidityTests([500, 3000]);
    });

    describe("Providing liquidity for poolFees = [ 500, 3000, 10000 ]", function () {
        liquidityTests([500, 3000, 10000]);
    });
});
