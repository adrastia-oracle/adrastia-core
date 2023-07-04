const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BAL = "0xba100000625a3754423978a60c9317c58a424e3D";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2%
const DEFAULT_UPDATE_DELAY = 1;
const DEFAULT_HEARTBEAT = 100;

const WEIGHT_50 = BigNumber.from("500000000000000000");
const WEIGHT_80 = BigNumber.from("800000000000000000");
const WEIGHT_20 = BigNumber.from("200000000000000000");

async function deployDefaultAccumulator(averagingStrategyName, quoteToken, tokens) {
    const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const vaultFactory = await ethers.getContractFactory("BalancerVaultStub");
    const vault = await vaultFactory.deploy();
    await vault.deployed();

    const poolId = ethers.utils.solidityKeccak256(["address", "address"], [quoteToken, ethers.constants.AddressZero]);
    const tokenAddresses = tokens.map((token) => token.address);
    const weights = tokens.map((token) => token.weight);

    const poolFactory = await ethers.getContractFactory("BalancerWeightedPoolStub");
    const pool = await poolFactory.deploy(poolId, weights);
    await pool.deployed();

    await vault.stubRegisterPool(poolId, pool.address, tokenAddresses);

    const accumulatorFactory = await ethers.getContractFactory("BalancerV2WeightedPriceAccumulatorStub");
    const accumulator = await accumulatorFactory.deploy(
        averagingStrategy.address,
        vault.address,
        poolId,
        quoteToken,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );
    await accumulator.deployed();

    return {
        accumulator: accumulator,
        averagingStrategy: averagingStrategy,
        vault: vault,
        pool: pool,
        poolId: poolId,
    };
}

function describeBalancerWeightedPriceAccumulatorTests(contractName, averagingStrategyName) {
    describe(contractName + " using " + averagingStrategyName, function () {
        describe(contractName + "#constructor", function () {
            it("Should deploy successfully", async function () {
                const tokens = [
                    {
                        address: WETH,
                        weight: WEIGHT_50,
                    },
                    {
                        address: USDC,
                        weight: WEIGHT_50,
                    },
                ];

                const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
            });

            it("Should revert when the quote token is not in the pool", async function () {
                const tokens = [
                    {
                        address: WETH,
                        weight: WEIGHT_50,
                    },
                    {
                        address: BAL,
                        weight: WEIGHT_50,
                    },
                ];

                await expect(deployDefaultAccumulator(averagingStrategyName, USDC, tokens)).to.be.revertedWith(
                    'TokenNotFound("' + USDC + '")'
                );
            });
        });

        describe(contractName + "#canUpdate", function () {
            var accumulator;
            var vault;
            var pool;
            var poolId;

            beforeEach(async () => {
                const tokens = [
                    {
                        address: WETH,
                        weight: WEIGHT_50,
                    },
                    {
                        address: USDC,
                        weight: WEIGHT_50,
                    },
                ];

                const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                accumulator = deployment.accumulator;
                vault = deployment.vault;
                pool = deployment.pool;
                poolId = deployment.poolId;

                await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));
            });

            it("Should return false when given token that's not in the pool", async function () {
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(BAL, 32))).to.equal(false);
            });

            it("Should return true when given a token that's in the pool", async function () {
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
            });

            it("Should return true when given a token that's in the pool, with the pool not supporting pause state", async function () {
                await pool.stubSetPausedStateSupported(false);

                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
            });

            it("Should return true when given a token that's in the pool, with the pool not supporting simple pausing", async function () {
                await pool.stubSetPausedSupported(false);

                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
            });

            it("Should return true when given a token that's in the pool, with the pool not supporting any pausing", async function () {
                await pool.stubSetPausedStateSupported(false);
                await pool.stubSetPausedSupported(false);

                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
            });

            it("Should return false when the token is the zero address", async function () {
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32))).to.equal(
                    false
                );
            });

            it("Should return false when the token is the quote token", async function () {
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(USDC, 32))).to.equal(false);
            });

            it("Should return false when the pool is paused (with pause state)", async function () {
                await pool.stubSetPausedSupported(false);

                await pool.stubSetPaused(true);
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                // Sanity check: Returns true when not paused
                await pool.stubSetPaused(false);
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
            });

            it("Should return false when the pool is paused (with simple pausing)", async function () {
                await pool.stubSetPausedStateSupported(false);

                await pool.stubSetPaused(true);
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                // Sanity check: Returns true when not paused
                await pool.stubSetPaused(false);
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
            });

            it("Should return false when the token balance is zero", async function () {
                await vault.stubSetBalance(poolId, WETH, BigNumber.from(0));
                expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);
            });
        });

        describe(contractName + "#fetchPrice", function () {
            var accumulator;
            var vault;
            var pool;
            var poolId;

            beforeEach(async () => {
                const tokens = [
                    {
                        address: WETH,
                        weight: WEIGHT_50,
                    },
                    {
                        address: USDC,
                        weight: WEIGHT_50,
                    },
                ];

                const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                accumulator = deployment.accumulator;
                vault = deployment.vault;
                pool = deployment.pool;
                poolId = deployment.poolId;

                await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));
            });

            describe("Using a 50/50 pool", function () {
                beforeEach(async () => {
                    const tokens = [
                        {
                            address: WETH,
                            weight: WEIGHT_50,
                        },
                        {
                            address: USDC,
                            weight: WEIGHT_50,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct price (= 1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });
            });

            describe("Using a 50/50 pool (tokens in reverse order)", function () {
                beforeEach(async function () {
                    const tokens = [
                        {
                            address: USDC,
                            weight: WEIGHT_50,
                        },
                        {
                            address: WETH,
                            weight: WEIGHT_50,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));
                });

                it("Should return the correct price (= 1 USDC)", async function () {
                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });
            });

            describe("Using a 80/20 pool", function () {
                beforeEach(async function () {
                    const tokens = [
                        {
                            address: WETH,
                            weight: WEIGHT_80,
                        },
                        {
                            address: USDC,
                            weight: WEIGHT_20,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct price (= 1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000000000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000000000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });
            });

            describe("Using a 80/20 pool (tokens in reverse order)", function () {
                beforeEach(async function () {
                    const tokens = [
                        {
                            address: USDC,
                            weight: WEIGHT_20,
                        },
                        {
                            address: WETH,
                            weight: WEIGHT_80,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct price (= 1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000000000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000000000.0", 18).mul(80));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(20));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });
            });

            describe("Using a 20/80 pool", function () {
                beforeEach(async function () {
                    const tokens = [
                        {
                            address: WETH,
                            weight: WEIGHT_20,
                        },
                        {
                            address: USDC,
                            weight: WEIGHT_80,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct price (= 1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000000000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000000000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });
            });

            describe("Using a 20/80 pool (tokens in reverse order)", function () {
                beforeEach(async function () {
                    const tokens = [
                        {
                            address: USDC,
                            weight: WEIGHT_80,
                        },
                        {
                            address: WETH,
                            weight: WEIGHT_20,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct price (= 1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000000000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000000000.0", 18).mul(20));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6).mul(80));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });
            });

            describe("Using a 20/20/20/20/20 pool", function () {
                beforeEach(async () => {
                    const tokens = [
                        {
                            address: WETH,
                            weight: WEIGHT_20,
                        },
                        {
                            address: USDC,
                            weight: WEIGHT_20,
                        },
                        {
                            address: GRT,
                            weight: WEIGHT_20,
                        },
                        {
                            address: UNI,
                            weight: WEIGHT_20,
                        },
                        {
                            address: BAL,
                            weight: WEIGHT_20,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    await vault.stubSetBalance(poolId, GRT, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, UNI, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, BAL, ethers.utils.parseUnits("1000.0", 18));
                });

                it("Should return the correct price (= 1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC)", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with tiny balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });

                it("Should return the correct price (= 1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("1.0", 6));
                });

                it("Should return the correct price (= 10 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("10000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("10.0", 6));
                });

                it("Should return the correct price (= 0.1 USDC) with large balances", async function () {
                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("10000000000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000000000.0", 6));

                    expect(await accumulator.stubFetchPrice(WETH)).to.equal(ethers.utils.parseUnits("0.1", 6));
                });
            });

            it("Should revert if the pool is paused", async function () {
                await pool.stubSetPaused(true);
                await expect(accumulator.stubFetchPrice(WETH)).to.be.revertedWith("PoolIsPaused");
            });

            it("Should revert if the token balance is zero", async function () {
                await vault.stubSetBalance(poolId, WETH, BigNumber.from(0));
                await expect(accumulator.stubFetchPrice(WETH)).to.be.reverted;
            });

            it("Should return 1 when the true price is 0", async function () {
                await vault.stubSetBalance(poolId, USDC, BigNumber.from(0));

                expect(await accumulator.stubFetchPrice(WETH)).to.equal(BigNumber.from(1));
            });

            it("Should revert if the token is not in the pool", async function () {
                await expect(accumulator.stubFetchPrice(BAL)).to.be.revertedWith("TokenNotFound");
            });

            it("Doesn't revert if the pool doesn't support pausing", async function () {
                await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));

                await pool.stubSetPausedStateSupported(false);
                await pool.stubSetPausedSupported(false);

                await expect(accumulator.stubFetchPrice(WETH)).to.not.be.reverted;
            });
        });
    });
}

describeBalancerWeightedPriceAccumulatorTests("BalancerV2WeightedPriceAccumulator", "ArithmeticAveraging");
