const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;

const { abi: FACTORY_ABI, bytecode: FACTORY_BYTECODE } = require("@uniswap/v2-core/build/UniswapV2Factory.json");

const uniswapV2InitCodeHash = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;

describe("UniswapV2PriceAccumulator#computeWholeUnitAmount", function () {
    var accumulator;

    const tests = [
        {
            decimals: 0,
            wholeUnitAmount: BigNumber.from(1),
        },
        {
            decimals: 1,
            wholeUnitAmount: BigNumber.from(10),
        },
        {
            decimals: 6,
            wholeUnitAmount: BigNumber.from(1000000),
        },
        {
            decimals: 18,
            wholeUnitAmount: BigNumber.from("1000000000000000000"),
        },
    ];

    beforeEach(async () => {
        const accumulatorFactory = await ethers.getContractFactory("UniswapV2PriceAccumulatorStub");

        accumulator = await accumulatorFactory.deploy(
            AddressZero,
            uniswapV2InitCodeHash,
            AddressZero,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
    });

    tests.forEach(({ decimals, wholeUnitAmount }) => {
        it(`Should verify that a token with ${decimals} decimals has a whole unit amount of ${wholeUnitAmount.toString()}`, async () => {
            const erc20Factory = await ethers.getContractFactory("FakeERC20");

            const token = await erc20Factory.deploy("Token", "T", decimals);
            await token.deployed();

            expect(await accumulator.stubComputeWholeUnitAmount(token.address)).to.equal(wholeUnitAmount);
        });
    });
});

describe("UniswapV2PriceAccumulator", function () {
    var quoteToken;
    var token;
    var ltToken;
    var gtToken;

    var uniswapFactory;
    var accumulator;
    var addressHelper;

    async function createPair() {
        await uniswapFactory.createPair(token.address, quoteToken.address);
    }

    async function addLiquidity(tokenLiquidity, quoteTokenLiquidity) {
        const pair = await uniswapFactory.getPair(token.address, quoteToken.address);

        // Approve transfers to pair
        await token.approve(pair, tokenLiquidity);
        await quoteToken.approve(pair, quoteTokenLiquidity);

        // Send tokens to pair
        await token.transfer(pair, tokenLiquidity);
        await quoteToken.transfer(pair, quoteTokenLiquidity);
    }

    async function mint(tokenLiquidity, quoteTokenLiquidity) {
        const [owner] = await ethers.getSigners();

        const pair = await uniswapFactory.getPair(token.address, quoteToken.address);
        const pairContract = await ethers.getContractAt("FakeUniswapV2Pair", pair);

        await addLiquidity(tokenLiquidity, quoteTokenLiquidity);

        // Mint the LP tokens
        await pairContract.mint(owner.address);
    }

    beforeEach(async () => {
        const [owner] = await ethers.getSigners();

        const erc20Factory = await ethers.getContractFactory("FakeERC20");
        const uniswapFactoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
        const accumulatorFactory = await ethers.getContractFactory("UniswapV2PriceAccumulatorStub");
        const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

        addressHelper = await addressHelperFactory.deploy();

        var tokens = [undefined, undefined, undefined];

        for (var i = 0; i < tokens.length; ++i) tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
        for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

        tokens = tokens.sort(async (a, b) => await addressHelper.lessThan(a.address, b.address));

        token = ltToken = tokens[0];
        quoteToken = tokens[1];
        gtToken = tokens[2];

        uniswapFactory = await uniswapFactoryFactory.deploy(owner.getAddress());
        await uniswapFactory.deployed();

        accumulator = await accumulatorFactory.deploy(
            uniswapFactory.address,
            uniswapV2InitCodeHash,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
    });

    describe("UniswapV2PriceAccumulator#canUpdate", function () {
        describe("Can't update when", function () {
            it("token = address(0)", async function () {
                expect(await accumulator.canUpdate(AddressZero)).to.equal(false);
            });

            it("token = quoteToken", async function () {
                expect(await accumulator.canUpdate(quoteToken.address)).to.equal(false);
            });

            it("The pool doesn't exist", async function () {
                expect(await accumulator.canUpdate(token.address)).to.equal(false);
            });

            it("The pool has no liquidity", async function () {
                await createPair();

                expect(await accumulator.canUpdate(token.address)).to.equal(false);
            });

            it("The pool has no liquidity (tokens transferred but not minted)", async function () {
                await createPair();
                await addLiquidity(ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18));

                expect(await accumulator.canUpdate(token.address)).to.equal(false);
            });
        });

        describe("Can update when", function () {
            it("The pool exists and has liquidity", async function () {
                await createPair();
                await mint(ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18));

                expect(await accumulator.canUpdate(token.address)).to.equal(true);
            });
        });
    });

    describe("UniswapV2PriceAccumulator#fetchPrice", function () {
        const tests = [
            {
                tokenAmount: ethers.utils.parseUnits("1.0", 18),
                quoteTokenAmount: ethers.utils.parseUnits("1.0", 18),
            },
            {
                tokenAmount: ethers.utils.parseUnits("1.0", 18),
                quoteTokenAmount: ethers.utils.parseUnits("10.0", 18),
            },
            {
                tokenAmount: ethers.utils.parseUnits("10.0", 18),
                quoteTokenAmount: ethers.utils.parseUnits("1.0", 18),
            },
            {
                tokenAmount: ethers.utils.parseUnits("3.0", 18),
                quoteTokenAmount: ethers.utils.parseUnits("5.0", 18),
            },
            {
                tokenAmount: ethers.utils.parseUnits("5.0", 18),
                quoteTokenAmount: ethers.utils.parseUnits("3.0", 18),
            },
        ];

        function calculatePrice(tokenAmount, quoteTokenAmount, tokenDecimals) {
            const wholeTokenAmount = BigNumber.from(10).pow(tokenDecimals);

            var price = quoteTokenAmount.mul(wholeTokenAmount).div(tokenAmount);

            return price;
        }

        function describeFetchPriceTests(tokenDecimals) {
            describe(`token decimals = ${tokenDecimals}`, function () {
                beforeEach(async () => {
                    await token.setDecimals(tokenDecimals);
                });

                tests.forEach(({ tokenAmount, quoteTokenAmount }) => {
                    it(`fetchPrice(token) = ${calculatePrice(
                        tokenAmount,
                        quoteTokenAmount,
                        tokenDecimals
                    )} with tokenAmount = ${tokenAmount} and quoteTokenAmount = ${quoteTokenAmount}`, async function () {
                        await createPair();
                        await mint(tokenAmount, quoteTokenAmount);

                        const reportedPrice = await accumulator.stubFetchPrice(token.address);

                        expect(reportedPrice).to.equal(calculatePrice(tokenAmount, quoteTokenAmount, tokenDecimals));
                    });
                });
            });
        }

        describe("Should revert when", function () {
            it("The pool is not found", async function () {
                await expect(accumulator.stubFetchPrice(token.address)).to.be.revertedWith(
                    "UniswapV2PriceAccumulator: POOL_NOT_FOUND"
                );
            });

            it("The pool has no liquidity", async function () {
                await createPair();

                await expect(accumulator.stubFetchPrice(token.address)).to.be.revertedWith(
                    "UniswapV2PriceAccumulator: NO_LIQUIDITY"
                );
            });

            it("The pool has no liquidity (tokens transferred but not minted)", async function () {
                await createPair();
                await addLiquidity(ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18));

                await expect(accumulator.stubFetchPrice(token.address)).to.be.revertedWith(
                    "UniswapV2PriceAccumulator: NO_LIQUIDITY"
                );
            });

            it("token = address(0)", async function () {
                await expect(accumulator.stubFetchPrice(AddressZero)).to.be.revertedWith(
                    "UniswapV2PriceAccumulator: ZERO_ADDRESS"
                );
            });

            it("token = quoteToken", async function () {
                await expect(accumulator.stubFetchPrice(quoteToken.address)).to.be.revertedWith(
                    "UniswapV2PriceAccumulator: IDENTICAL_ADDRESSES"
                );
            });
        });

        describe("token < quoteToken", function () {
            beforeEach(async () => {
                token = ltToken;
            });

            describeFetchPriceTests(6);
            describeFetchPriceTests(18);
        });

        describe("token > quoteToken", function () {
            beforeEach(async () => {
                token = gtToken;
            });

            describeFetchPriceTests(6);
            describeFetchPriceTests(18);
        });
    });
});
