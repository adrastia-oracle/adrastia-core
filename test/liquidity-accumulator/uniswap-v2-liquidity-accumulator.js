const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;

const { abi: FACTORY_ABI, bytecode: FACTORY_BYTECODE } = require("@uniswap/v2-core/build/UniswapV2Factory.json");

const TWO_PERCENT_CHANGE = 2000000;
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function describeUniswapV2LiquidityAccumulatorTests(contractName, stubContractName, averagingStrategyName) {
    describe(contractName + " using " + averagingStrategyName, function () {
        var averagingStrategy;

        beforeEach(async function () {
            const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
            averagingStrategy = await averagingStrategyFactory.deploy();
            await averagingStrategy.deployed();
        });

        describe(contractName + "#constructor", function () {
            var fakeUniswapV2Factory;

            beforeEach(async () => {
                const [owner] = await ethers.getSigners();

                // Deploy fake uniswap v2 factory
                const FakeUniswapV2Factory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
                fakeUniswapV2Factory = await FakeUniswapV2Factory.deploy(owner.getAddress());
                await fakeUniswapV2Factory.deployed();
            });

            it("Should properly set liquidity decimals to 0", async function () {
                const accumulatorFactory = await ethers.getContractFactory(contractName);
                const accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    fakeUniswapV2Factory.address,
                    "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
                    USDC,
                    0, // Liquidity decimals
                    TWO_PERCENT_CHANGE,
                    100,
                    100
                );

                expect(await accumulator.liquidityDecimals()).equals(0);
                expect(await accumulator.quoteTokenDecimals()).equals(0);
            });

            it("Should properly set liquidity decimals to 18", async function () {
                const accumulatorFactory = await ethers.getContractFactory(contractName);
                const accumulator = await accumulatorFactory.deploy(
                    averagingStrategy.address,
                    fakeUniswapV2Factory.address,
                    "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
                    USDC,
                    18, // Liquidity decimals
                    TWO_PERCENT_CHANGE,
                    100,
                    100
                );

                expect(await accumulator.liquidityDecimals()).equals(18);
                expect(await accumulator.quoteTokenDecimals()).equals(18);
            });
        });

        describe(contractName, function () {
            this.timeout(100000);

            const minUpdateDelay = 10000;
            const maxUpdateDelay = 30000;

            var fakeUniswapV2Factory;
            var accumulator;
            var addressHelper;

            var quoteToken;
            var token;
            var ltToken;
            var gtToken;

            var noPairToken;

            beforeEach(async () => {
                const [owner] = await ethers.getSigners();

                // Deploy fake uniswap v2 factory
                const FakeUniswapV2Factory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
                fakeUniswapV2Factory = await FakeUniswapV2Factory.deploy(owner.getAddress());
                await fakeUniswapV2Factory.deployed();

                const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

                addressHelper = await addressHelperFactory.deploy();

                // Create tokens
                const erc20Factory = await ethers.getContractFactory("FakeERC20");

                noPairToken = await erc20Factory.deploy("No Pair Token", "NPT", 18);
                await noPairToken.deployed();

                token = await erc20Factory.deploy("Token", "T", 18);
                await token.deployed();

                var tokens = [undefined, undefined, undefined];

                for (var i = 0; i < tokens.length; ++i)
                    tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
                for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

                if (await addressHelper.lessThan(tokens[0].address, tokens[1].address)) {
                    // tokens[0] < tokens[1]
                    if (await addressHelper.lessThan(tokens[2].address, tokens[0].address)) {
                        // tokens[2] < tokens[0] < tokens[1]
                        ltToken = tokens[2];
                        quoteToken = tokens[0];
                        gtToken = tokens[1];
                    } else if (await addressHelper.lessThan(tokens[2].address, tokens[1].address)) {
                        // tokens[0] < tokens[2] < tokens[1]
                        ltToken = tokens[0];
                        quoteToken = tokens[2];
                        gtToken = tokens[1];
                    } else {
                        // tokens[0] < tokens[1] < tokens[2]
                        ltToken = tokens[0];
                        quoteToken = tokens[1];
                        gtToken = tokens[2];
                    }
                } else {
                    // tokens[1] < tokens[0]
                    if (await addressHelper.lessThan(tokens[2].address, tokens[1].address)) {
                        // tokens[2] < tokens[1] < tokens[0]
                        ltToken = tokens[2];
                        quoteToken = tokens[1];
                        gtToken = tokens[0];
                    } else if (await addressHelper.lessThan(tokens[2].address, tokens[0].address)) {
                        // tokens[1] < tokens[2] < tokens[0]
                        ltToken = tokens[1];
                        quoteToken = tokens[2];
                        gtToken = tokens[0];
                    } else {
                        // tokens[1] < tokens[0] < tokens[2]
                        ltToken = tokens[1];
                        quoteToken = tokens[0];
                        gtToken = tokens[2];
                    }
                }

                expect(await addressHelper.lessThan(ltToken.address, quoteToken.address)).to.be.true;
                expect(await addressHelper.lessThan(quoteToken.address, gtToken.address)).to.be.true;

                // Deploy uniswap v2 liquidity accumulator
                const LiquidityAccumulator = await ethers.getContractFactory(stubContractName);
                accumulator = await LiquidityAccumulator.deploy(
                    averagingStrategy.address,
                    fakeUniswapV2Factory.address,
                    "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
                    quoteToken.address,
                    0, // Liquidity decimals
                    TWO_PERCENT_CHANGE,
                    minUpdateDelay,
                    maxUpdateDelay
                );
            });

            describe(contractName + "#canUpdate", function () {
                describe("Can't update when", function () {
                    it("token = address(0)", async function () {
                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
                    });

                    it("token = quoteToken", async function () {
                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(quoteToken.address, 32))).to.equal(
                            false
                        );
                    });

                    it("The pool doesn't exist", async function () {
                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(token.address, 32))).to.equal(false);
                    });
                });

                describe("Can update when", function () {
                    it("The pool exists", async function () {
                        await fakeUniswapV2Factory.createPair(token.address, quoteToken.address);

                        expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(token.address, 32))).to.equal(true);
                    });
                });
            });

            describe(contractName + "#fetchLiquidity", function () {
                const tests = [
                    { args: [ethers.utils.parseUnits("10000", 18), ethers.utils.parseUnits("10000", 18)] },
                    { args: [ethers.utils.parseUnits("100000", 18), ethers.utils.parseUnits("10000", 18)] },
                    { args: [ethers.utils.parseUnits("10000", 18), ethers.utils.parseUnits("100000", 18)] },
                ];

                beforeEach(async function () {
                    // Configure pairs
                    await fakeUniswapV2Factory.createPair(token.address, quoteToken.address);
                    await fakeUniswapV2Factory.createPair(ltToken.address, quoteToken.address);
                    await fakeUniswapV2Factory.createPair(gtToken.address, quoteToken.address);
                });

                it("Should revert when the pair does not exist", async () => {
                    await expect(accumulator.harnessFetchLiquidity(noPairToken.address)).to.be.revertedWith(
                        "UniswapV2LiquidityAccumulator: POOL_NOT_FOUND"
                    );
                });

                it("Should revert if token == quoteToken", async function () {
                    await expect(accumulator.harnessFetchLiquidity(quoteToken.address)).to.be.reverted;
                });

                it("Should revert if token == address(0)", async function () {
                    await expect(accumulator.harnessFetchLiquidity(AddressZero)).to.be.reverted;
                });

                tests.forEach(({ args }) => {
                    it(`Should get liquidities {tokenLiqudity = ${args[0]}, quoteTokenLiquidity = ${args[1]}}`, async () => {
                        const [owner] = await ethers.getSigners();

                        // Get pair
                        const ltPair = await fakeUniswapV2Factory.getPair(ltToken.address, quoteToken.address);
                        const gtPair = await fakeUniswapV2Factory.getPair(gtToken.address, quoteToken.address);
                        const ltPairContract = await ethers.getContractAt("IUniswapV2Pair", ltPair);
                        const gtPairContract = await ethers.getContractAt("IUniswapV2Pair", gtPair);

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

                        const [ltTokenLiquidity, quoteTokenLiquidity1] = await accumulator.harnessFetchLiquidity(
                            ltToken.address
                        );

                        const [gtTokenLiquidity, quoteTokenLiquidity2] = await accumulator.harnessFetchLiquidity(
                            gtToken.address
                        );

                        expect(ltTokenLiquidity).to.equal(
                            BigNumber.from(args[0].div(BigNumber.from(10).pow(await ltToken.decimals())))
                        );
                        expect(gtTokenLiquidity).to.equal(
                            BigNumber.from(args[0].div(BigNumber.from(10).pow(await gtToken.decimals())))
                        );
                        expect(quoteTokenLiquidity1).to.equal(
                            BigNumber.from(args[1].div(BigNumber.from(10).pow(await quoteToken.decimals())))
                        );
                        expect(quoteTokenLiquidity2).to.equal(
                            BigNumber.from(args[1].div(BigNumber.from(10).pow(await quoteToken.decimals())))
                        );
                    });
                });
            });
        });
    });
}

describeUniswapV2LiquidityAccumulatorTests(
    "UniswapV2LiquidityAccumulator",
    "UniswapV2LiquidityAccumulatorStub",
    "ArithmeticAveraging"
);
describeUniswapV2LiquidityAccumulatorTests(
    "UniswapV2LiquidityAccumulator",
    "UniswapV2LiquidityAccumulatorStub",
    "GeometricAveraging"
);
describeUniswapV2LiquidityAccumulatorTests(
    "UniswapV2LiquidityAccumulator",
    "UniswapV2LiquidityAccumulatorStub",
    "HarmonicAveragingWS80"
);
