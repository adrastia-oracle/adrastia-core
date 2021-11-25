const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const { abi: FACTORY_ABI, bytecode: FACTORY_BYTECODE } = require("@uniswap/v2-core/build/UniswapV2Factory.json");

const TWO_PERCENT_CHANGE = 2000000;

describe("UniswapV2LiquidityAccumulator#fetchLiquidity", function () {
    this.timeout(100000);

    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var fakeUniswapV2Factory;
    var liquidityAccumulator;

    var quoteToken;
    var token;
    var ltToken;
    var gtToken;

    var noPairToken;

    const tests = [{ args: [10000, 10000] }, { args: [100000, 10000] }, { args: [10000, 100000] }];

    beforeEach(async () => {
        const [owner] = await ethers.getSigners();

        // Deploy fake uniswap v2 factory
        const FakeUniswapV2Factory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
        fakeUniswapV2Factory = await FakeUniswapV2Factory.deploy(owner.getAddress());
        await fakeUniswapV2Factory.deployed();

        // Create tokens
        const erc20Factory = await ethers.getContractFactory("FakeERC20");

        noPairToken = await erc20Factory.deploy("No Pair Token", "NPT", 18);
        await noPairToken.deployed();

        token = await erc20Factory.deploy("Token", "T", 18);
        await token.deployed();

        var tokens = [undefined, undefined, undefined];
        for (var i = 0; i < tokens.length; ++i) {
            tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
            await tokens[i].deployed();
        }

        tokens = tokens.sort((a, b) => {
            a.address < b.address;
        });

        ltToken = tokens[0];
        quoteToken = tokens[1];
        gtToken = tokens[2];

        // Configure pairs
        await fakeUniswapV2Factory.createPair(token.address, quoteToken.address);
        await fakeUniswapV2Factory.createPair(ltToken.address, quoteToken.address);
        await fakeUniswapV2Factory.createPair(gtToken.address, quoteToken.address);

        // Deploy uniswap v2 liquidity accumulator
        const LiquidityAccumulator = await ethers.getContractFactory("UniswapV2LiquidityAccumulatorStub");
        liquidityAccumulator = await LiquidityAccumulator.deploy(
            fakeUniswapV2Factory.address,
            "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
    });

    it("Should revert when reserves don't have a timestamp", async () => {
        await expect(liquidityAccumulator.harnessFetchLiquidity(token.address)).to.be.revertedWith(
            "UniswapV2LiquidityAccumulator: MISSING_RESERVES_TIMESTAMP"
        );
    });

    it("Should revert when the pair does not exist", async () => {
        await expect(liquidityAccumulator.harnessFetchLiquidity(noPairToken.address)).to.be.revertedWith(
            "UniswapV2LiquidityAccumulator: POOL_NOT_FOUND"
        );
    });

    tests.forEach(({ args }) => {
        it(`Should get liquidities {tokenLiqudity = ${args[0]}, quoteTokenLiquidity = ${args[1]}}`, async () => {
            const [owner] = await ethers.getSigners();

            // Get pair
            const ltPair = await fakeUniswapV2Factory.getPair(ltToken.address, quoteToken.address);
            const gtPair = await fakeUniswapV2Factory.getPair(gtToken.address, quoteToken.address);
            const ltPairContract = await ethers.getContractAt("FakeUniswapV2Pair", ltPair);
            const gtPairContract = await ethers.getContractAt("FakeUniswapV2Pair", gtPair);

            // Approve transfers to pair (ltToken, quoteToken)
            await ltToken.approve(ltPair, args[0]);
            await quoteToken.approve(ltPair, args[1]);

            // Approve transfers to pair (gtToken, quoteToken)
            await gtToken.approve(gtPair, args[0]);
            await quoteToken.approve(gtPair, args[1]);

            // Send tokens to pair (ltToken, quoteToken)
            await ltToken.transfer(ltPair, args[0]);
            await quoteToken.transfer(ltPair, args[1]);

            // Send tokens to pair (gtToken, quoteToken)
            await gtToken.transfer(gtPair, args[0]);
            await quoteToken.transfer(gtPair, args[1]);

            // Mint the pairs
            await ltPairContract.mint(owner.address);
            await gtPairContract.mint(owner.address);

            const [ltTokenLiquidity, quoteTokenLiquidity1] = await liquidityAccumulator.harnessFetchLiquidity(
                ltToken.address
            );

            const [gtTokenLiquidity, quoteTokenLiquidity2] = await liquidityAccumulator.harnessFetchLiquidity(
                gtToken.address
            );

            expect(ltTokenLiquidity).to.equal(BigNumber.from(args[0]));
            expect(gtTokenLiquidity).to.equal(BigNumber.from(args[0]));
            expect(quoteTokenLiquidity1).to.equal(BigNumber.from(args[1]));
            expect(quoteTokenLiquidity2).to.equal(BigNumber.from(args[1]));
        });
    });
});
