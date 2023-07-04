const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const aUSDC = "0x9bA00D6856a4eDF4665BcA2C2309936572473B7E";
const aWETH = "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BAL = "0xba100000625a3754423978a60c9317c58a424e3D";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

const DEFAULT_LIQUIDITY_DECIMALS = 0;
const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2%
const DEFAULT_UPDATE_DELAY = 1;
const DEFAULT_HEARTBEAT = 100;

const WEIGHT_50 = BigNumber.from("500000000000000000");
const WEIGHT_80 = BigNumber.from("800000000000000000");
const WEIGHT_20 = BigNumber.from("200000000000000000");

async function deployVault() {
    const vaultFactory = await ethers.getContractFactory("BalancerVaultStub");
    const vault = await vaultFactory.deploy();
    await vault.deployed();

    return vault;
}

async function deployLinearPool(vault, mainToken, tokens) {
    const mainTokenIndex = tokens.findIndex((token) => token.address === mainToken);

    const poolId = ethers.utils.solidityKeccak256(
        ["string", "address", "uint256"],
        ["BalancerLinearPoolStub", mainToken, mainTokenIndex]
    );
    const poolFactory = await ethers.getContractFactory("BalancerLinearPoolStub");
    const pool = await poolFactory.deploy(poolId, mainToken, mainTokenIndex);
    await pool.deployed();

    const tokenAddresses = tokens.map((token) => token.address);

    await vault.stubRegisterPool(poolId, pool.address, tokenAddresses);

    return pool;
}

async function deployWeightedPool(vault, poolId, tokens) {
    const tokenAddresses = tokens.map((token) => token.address);
    const weights = tokens.map((token) => token.weight);

    const poolFactory = await ethers.getContractFactory("BalancerWeightedPoolStub");
    const pool = await poolFactory.deploy(poolId, weights);
    await pool.deployed();

    await vault.stubRegisterPool(poolId, pool.address, tokenAddresses);

    return pool;
}

async function deployDefaultAccumulator(
    vault,
    averagingStrategyName,
    quoteToken,
    tokens,
    deployPoolFunc = deployWeightedPool
) {
    const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const poolId = ethers.utils.solidityKeccak256(["address", "address"], [quoteToken, ethers.constants.AddressZero]);

    const pool = await deployPoolFunc(vault, poolId, tokens);

    const accumulatorFactory = await ethers.getContractFactory("BalancerV2LiquidityAccumulatorStub");
    const accumulator = await accumulatorFactory.deploy(
        averagingStrategy.address,
        vault.address,
        poolId,
        quoteToken,
        DEFAULT_LIQUIDITY_DECIMALS,
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

function describeBalancerLiquidityAccumulatorTests(contractName, averagingStrategyName) {
    describe(contractName + " using " + averagingStrategyName, function () {
        describe(contractName + "#constructor", function () {
            it("Should deploy successfully with a simple weighted pool", async function () {
                const vault = await deployVault();

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

                const deployment = await deployDefaultAccumulator(
                    vault,
                    averagingStrategyName,
                    USDC,
                    tokens,
                    deployWeightedPool
                );

                expect(await deployment.accumulator.poolId()).to.equal(deployment.poolId);
                expect(await deployment.accumulator.quoteToken()).to.equal(USDC);
                expect(await deployment.accumulator.liquidityDecimals()).to.equal(DEFAULT_LIQUIDITY_DECIMALS);
                expect(await deployment.accumulator.quoteTokenDecimals()).to.equal(DEFAULT_LIQUIDITY_DECIMALS);
                expect(await deployment.accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
                expect(await deployment.accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
                expect(await deployment.accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
                expect(await deployment.accumulator.averagingStrategy()).to.equal(deployment.averagingStrategy.address);
                expect(await deployment.accumulator.balancerVault()).to.equal(deployment.vault.address);
                expect(await deployment.accumulator.poolAddress()).to.equal(deployment.pool.address);
            });

            it("Should deploy successfully with a weighted pool and our token is inside of a linear pool", async function () {
                const vault = await deployVault();

                const linearPoolTokens = [
                    {
                        address: WETH,
                    },
                    {
                        address: aWETH,
                    },
                ];
                const linearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                const tokens = [
                    {
                        address: linearPool.address,
                        weight: WEIGHT_50,
                    },
                    {
                        address: USDC,
                        weight: WEIGHT_50,
                    },
                ];

                const deployment = await deployDefaultAccumulator(
                    vault,
                    averagingStrategyName,
                    USDC,
                    tokens,
                    deployWeightedPool
                );

                expect(await deployment.accumulator.poolId()).to.equal(deployment.poolId);
                expect(await deployment.accumulator.quoteToken()).to.equal(USDC);
                expect(await deployment.accumulator.liquidityDecimals()).to.equal(DEFAULT_LIQUIDITY_DECIMALS);
                expect(await deployment.accumulator.quoteTokenDecimals()).to.equal(DEFAULT_LIQUIDITY_DECIMALS);
                expect(await deployment.accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
                expect(await deployment.accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
                expect(await deployment.accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
                expect(await deployment.accumulator.averagingStrategy()).to.equal(deployment.averagingStrategy.address);
                expect(await deployment.accumulator.balancerVault()).to.equal(deployment.vault.address);
                expect(await deployment.accumulator.poolAddress()).to.equal(deployment.pool.address);
            });

            it("Should deploy successfully with a weighted pool and our quote token is inside of a linear pool", async function () {
                const vault = await deployVault();

                const linearPoolTokens = [
                    {
                        address: aUSDC,
                    },
                    {
                        address: USDC,
                    },
                ];
                const linearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                const tokens = [
                    {
                        address: linearPool.address,
                        weight: WEIGHT_50,
                    },
                    {
                        address: WETH,
                        weight: WEIGHT_50,
                    },
                ];

                const deployment = await deployDefaultAccumulator(
                    vault,
                    averagingStrategyName,
                    USDC,
                    tokens,
                    deployWeightedPool
                );

                expect(await deployment.accumulator.poolId()).to.equal(deployment.poolId);
                expect(await deployment.accumulator.quoteToken()).to.equal(USDC);
                expect(await deployment.accumulator.liquidityDecimals()).to.equal(DEFAULT_LIQUIDITY_DECIMALS);
                expect(await deployment.accumulator.quoteTokenDecimals()).to.equal(DEFAULT_LIQUIDITY_DECIMALS);
                expect(await deployment.accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
                expect(await deployment.accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
                expect(await deployment.accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
                expect(await deployment.accumulator.averagingStrategy()).to.equal(deployment.averagingStrategy.address);
                expect(await deployment.accumulator.balancerVault()).to.equal(deployment.vault.address);
                expect(await deployment.accumulator.poolAddress()).to.equal(deployment.pool.address);
            });

            it("Should revert when the quote token is not in the pool (using a simple weighted pool)", async function () {
                const vault = await deployVault();

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

                await expect(
                    deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens, deployWeightedPool)
                ).to.be.revertedWith('TokenNotFound("' + USDC + '")');
            });

            it("Should revert when the quote token is not in the pool (using a weighted pool with one linear pool)", async function () {
                const vault = await deployVault();

                const linearPoolTokens = [
                    {
                        address: aWETH,
                    },
                    {
                        address: WETH,
                    },
                ];
                const linearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                const tokens = [
                    {
                        address: linearPool.address,
                        weight: WEIGHT_50,
                    },
                    {
                        address: BAL,
                        weight: WEIGHT_50,
                    },
                ];

                await expect(
                    deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens, deployWeightedPool)
                ).to.be.revertedWith('TokenNotFound("' + USDC + '")');
            });
        });

        describe(contractName + "#canUpdate", function () {
            describe("With a simple weighted pool", function () {
                var accumulator;
                var vault;
                var pool;
                var poolId;

                beforeEach(async () => {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(
                        vault,
                        averagingStrategyName,
                        USDC,
                        tokens,
                        deployWeightedPool
                    );
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

                it("Should return true when given a token that's in the pool, with the pool not supporting pause states", async function () {
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
                    expect(
                        await accumulator.canUpdate(ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32))
                    ).to.equal(false);
                });

                it("Should return false when the token is the quote token", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(USDC, 32))).to.equal(false);
                });

                it("Should return false when the pool paused (with pause states)", async function () {
                    await pool.stubSetPausedSupported(false);

                    await pool.stubSetPaused(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when not paused
                    await pool.stubSetPaused(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return false when the pool paused (with simple pausing)", async function () {
                    await pool.stubSetPausedStateSupported(false);

                    await pool.stubSetPaused(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when not paused
                    await pool.stubSetPaused(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });
            });

            describe("With a weighted pool and the token is in a linear pool", function () {
                var accumulator;
                var vault;
                var pool;
                var poolId;
                var linearPool;

                beforeEach(async () => {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: aWETH,
                        },
                        {
                            address: WETH,
                        },
                    ];
                    linearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                    const tokens = [
                        {
                            address: linearPool.address,
                            weight: WEIGHT_50,
                        },
                        {
                            address: USDC,
                            weight: WEIGHT_50,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(
                        vault,
                        averagingStrategyName,
                        USDC,
                        tokens,
                        deployWeightedPool
                    );
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    const linearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(linearPoolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));
                });

                it("Should return false when given token that's not in the pool", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(BAL, 32))).to.equal(false);
                });

                it("Should return true when given a token that's in the pool", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return true when given a token that's in the pool, with the pool not supporting pause states", async function () {
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
                    expect(
                        await accumulator.canUpdate(ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32))
                    ).to.equal(false);
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

                it("Should return false when the linear pool is paused (with pause state)", async function () {
                    await pool.stubSetPausedSupported(false);

                    await linearPool.stubSetPaused(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when not paused
                    await linearPool.stubSetPaused(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return false when the linear pool is paused (with simple pausing)", async function () {
                    await pool.stubSetPausedStateSupported(false);

                    await linearPool.stubSetPaused(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when not paused
                    await linearPool.stubSetPaused(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });
            });

            describe("With a weighted pool and the quote token is in a linear pool", function () {
                var accumulator;
                var vault;
                var pool;
                var poolId;
                var linearPool;

                beforeEach(async () => {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: aUSDC,
                        },
                        {
                            address: USDC,
                        },
                    ];
                    linearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                    const tokens = [
                        {
                            address: linearPool.address,
                            weight: WEIGHT_50,
                        },
                        {
                            address: WETH,
                            weight: WEIGHT_50,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(
                        vault,
                        averagingStrategyName,
                        USDC,
                        tokens,
                        deployWeightedPool
                    );
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    const linearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(linearPoolId, USDC, ethers.utils.parseUnits("1000.0", 6));
                });

                it("Should return false when given token that's not in the pool", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(BAL, 32))).to.equal(false);
                });

                it("Should return true when given a token that's in the pool", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return true when given a token that's in the pool, with the pool not supporting pause states", async function () {
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
                    expect(
                        await accumulator.canUpdate(ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32))
                    ).to.equal(false);
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

                it("Should return false when the linear pool is paused (with pause state)", async function () {
                    await pool.stubSetPausedSupported(false);

                    await linearPool.stubSetPaused(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when not paused
                    await linearPool.stubSetPaused(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return false when the linear pool is paused (with simple pausing)", async function () {
                    await pool.stubSetPausedStateSupported(false);

                    await linearPool.stubSetPaused(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when not paused
                    await linearPool.stubSetPaused(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });
            });
        });

        describe(contractName + "#fetchLiquidity", function () {
            var accumulator;
            var vault;
            var pool;
            var poolId;

            beforeEach(async () => {
                vault = await deployVault();

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

                const deployment = await deployDefaultAccumulator(
                    vault,
                    averagingStrategyName,
                    USDC,
                    tokens,
                    deployWeightedPool
                );
                accumulator = deployment.accumulator;
                vault = deployment.vault;
                pool = deployment.pool;
                poolId = deployment.poolId;

                await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));
            });

            describe("Using a 50/50 pool", function () {
                beforeEach(async () => {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Doesn't revert if the pool doesn't support pause states", async function () {
                    await pool.stubSetPausedStateSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if the pool doesn't support simple pausing", async function () {
                    await pool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if the pool doesn't support any pausing", async function () {
                    await pool.stubSetPausedStateSupported(false);
                    await pool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });
            });

            describe("Using a 50/50 pool (tokens in reverse order)", function () {
                beforeEach(async function () {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });
            });

            describe("Using a 50/50 pool with the token being inside of a linear pool", function () {
                var linearPool;

                beforeEach(async () => {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: WETH,
                        },
                        {
                            address: aWETH,
                        },
                    ];
                    linearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                    const tokens = [
                        {
                            address: linearPool.address,
                            weight: WEIGHT_50,
                        },
                        {
                            address: USDC,
                            weight: WEIGHT_50,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    const wethLinearPoolId = await linearPool.getPoolId();
                    // Set the balance of the wrapped token in the linear pool to a junk value
                    // This is to ensure that the accumulator is not using the balance of the wrapped token
                    await vault.stubSetBalance(wethLinearPoolId, aWETH, ethers.utils.parseUnits("123456", 18));
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should revert if the linear pool is paused (with pause state)", async function () {
                    await linearPool.stubSetPausedSupported(false);

                    await linearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the linear pool is paused (with simple pausing)", async function () {
                    await linearPool.stubSetPausedStateSupported(false);

                    await linearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the token is not in the pool", async function () {
                    await expect(accumulator.stubFetchLiquidity(BAL)).to.be.revertedWith("TokenNotFound");
                });

                it("Doesn't revert if none of the pools support paused states", async function () {
                    await pool.stubSetPausedStateSupported(false);
                    await linearPool.stubSetPausedStateSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if none of the pools support simple pausing", async function () {
                    await pool.stubSetPausedSupported(false);
                    await linearPool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if none of the pools support any pausing", async function () {
                    await pool.stubSetPausedStateSupported(false);
                    await linearPool.stubSetPausedStateSupported(false);
                    await pool.stubSetPausedSupported(false);
                    await linearPool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });
            });

            describe("Using a 50/50 pool with the quote token being inside of a linear pool", function () {
                var linearPool;

                beforeEach(async () => {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: USDC,
                        },
                        {
                            address: aUSDC,
                        },
                    ];
                    linearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                    const tokens = [
                        {
                            address: WETH,
                            weight: WEIGHT_50,
                        },
                        {
                            address: linearPool.address,
                            weight: WEIGHT_50,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    const usdcinearPoolId = await linearPool.getPoolId();
                    // Set the balance of the wrapped token in the linear pool to a junk value
                    // This is to ensure that the accumulator is not using the balance of the wrapped token
                    await vault.stubSetBalance(usdcinearPoolId, aUSDC, ethers.utils.parseUnits("123456", 18));
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should revert if the linear pool is paused (with pause state)", async function () {
                    await linearPool.stubSetPausedSupported(false);

                    await linearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the linear pool is paused (with simple pausing)", async function () {
                    await linearPool.stubSetPausedStateSupported(false);

                    await linearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the token is not in the pool", async function () {
                    await expect(accumulator.stubFetchLiquidity(BAL)).to.be.revertedWith("TokenNotFound");
                });

                it("Doesn't revert if none of the pools support paused states", async function () {
                    await pool.stubSetPausedStateSupported(false);
                    await linearPool.stubSetPausedStateSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if none of the pools support simple pausing", async function () {
                    await pool.stubSetPausedSupported(false);
                    await linearPool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if none of the pools support any pausing", async function () {
                    await pool.stubSetPausedStateSupported(false);
                    await linearPool.stubSetPausedStateSupported(false);
                    await pool.stubSetPausedSupported(false);
                    await linearPool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const usdcLinearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });
            });

            describe("Using a 50/50 pool with all tokens being inside of linear pools", function () {
                var wethLinearPool;
                var usdcLinearPool;

                beforeEach(async () => {
                    vault = await deployVault();

                    const wethLinearPoolTokens = [
                        {
                            address: WETH,
                        },
                        {
                            address: aWETH,
                        },
                    ];
                    wethLinearPool = await deployLinearPool(vault, WETH, wethLinearPoolTokens);

                    const usdcLinearPoolTokens = [
                        {
                            address: USDC,
                        },
                        {
                            address: aUSDC,
                        },
                    ];
                    usdcLinearPool = await deployLinearPool(vault, USDC, usdcLinearPoolTokens);

                    const tokens = [
                        {
                            address: wethLinearPool.address,
                            weight: WEIGHT_50,
                        },
                        {
                            address: usdcLinearPool.address,
                            weight: WEIGHT_50,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    const usdcinearPoolId = await usdcLinearPool.getPoolId();
                    // Set the balance of the wrapped token in the linear pool to a junk value
                    // This is to ensure that the accumulator is not using the balance of the wrapped token
                    await vault.stubSetBalance(usdcinearPoolId, aUSDC, ethers.utils.parseUnits("123456", 18));

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    // Set the balance of the wrapped token in the linear pool to a junk value
                    // This is to ensure that the accumulator is not using the balance of the wrapped token
                    await vault.stubSetBalance(wethLinearPoolId, aWETH, ethers.utils.parseUnits("123456", 18));
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should revert if the token linear pool is paused (with pause state)", async function () {
                    await wethLinearPool.stubSetPausedStateSupported(false);

                    await wethLinearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the quote token linear pool is paused (with pause state)", async function () {
                    await usdcLinearPool.stubSetPausedStateSupported(false);

                    await usdcLinearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if all of the linear pools are paused (with pause state)", async function () {
                    await wethLinearPool.stubSetPausedStateSupported(false);
                    await usdcLinearPool.stubSetPausedStateSupported(false);

                    await wethLinearPool.stubSetPaused(true);
                    await usdcLinearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the token linear pool is paused (with simple pausing)", async function () {
                    await wethLinearPool.stubSetPausedStateSupported(false);

                    await wethLinearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the quote token linear pool is paused (with simple pausing)", async function () {
                    await usdcLinearPool.stubSetPausedStateSupported(false);

                    await usdcLinearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if all of the linear pools are paused (with simple pausing)", async function () {
                    await wethLinearPool.stubSetPausedStateSupported(false);
                    await usdcLinearPool.stubSetPausedStateSupported(false);

                    await wethLinearPool.stubSetPaused(true);
                    await usdcLinearPool.stubSetPaused(true);
                    await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
                });

                it("Should revert if the token is not in the pool", async function () {
                    await expect(accumulator.stubFetchLiquidity(BAL)).to.be.revertedWith("TokenNotFound");
                });

                it("Doesn't revert if none of the pools support pause states", async function () {
                    await pool.stubSetPausedStateSupported(false);
                    await wethLinearPool.stubSetPausedStateSupported(false);
                    await usdcLinearPool.stubSetPausedStateSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if none of the pools support simple pausing", async function () {
                    await pool.stubSetPausedSupported(false);
                    await wethLinearPool.stubSetPausedSupported(false);
                    await usdcLinearPool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });

                it("Doesn't revert if none of the pools support any pausing", async function () {
                    await pool.stubSetPausedStateSupported(false);
                    await wethLinearPool.stubSetPausedStateSupported(false);
                    await usdcLinearPool.stubSetPausedStateSupported(false);
                    await pool.stubSetPausedSupported(false);
                    await wethLinearPool.stubSetPausedSupported(false);
                    await usdcLinearPool.stubSetPausedSupported(false);

                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    const wethLinearPoolId = await wethLinearPool.getPoolId();
                    const usdcLinearPoolId = await usdcLinearPool.getPoolId();

                    await vault.stubSetBalance(wethLinearPoolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(usdcLinearPoolId, USDC, usdcLiquidity);

                    await expect(accumulator.stubFetchLiquidity(WETH)).to.not.be.reverted;
                });
            });

            describe("Using a 80/20 pool", function () {
                beforeEach(async function () {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });
            });

            describe("Using a 80/20 pool (tokens in reverse order)", function () {
                beforeEach(async function () {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });
            });

            describe("Using a 20/80 pool", function () {
                beforeEach(async function () {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });
            });

            describe("Using a 20/80 pool (tokens in reverse order)", function () {
                beforeEach(async function () {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });
            });

            describe("Using a 20/20/20/20/20 pool", function () {
                beforeEach(async () => {
                    vault = await deployVault();

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

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    await vault.stubSetBalance(poolId, GRT, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, UNI, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, BAL, ethers.utils.parseUnits("1000.0", 18));
                });

                it("Should return the correct liquidity (1,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000 WETH, 10,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000;
                    const usdcWholeTokenLiquidity = 10000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);
                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10,000 WETH, 1,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10000;
                    const usdcWholeTokenLiquidity = 1000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1 WETH, 10 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1;
                    const usdcWholeTokenLiquidity = 10;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (10 WETH, 1 USDC)", async function () {
                    const wethWholeTokenLiquidity = 10;
                    const usdcWholeTokenLiquidity = 1;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (100,000,000 WETH, 1,000,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 100000000;
                    const usdcWholeTokenLiquidity = 1000000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });

                it("Should return the correct liquidity (1,000,000,000 WETH, 100,000,000 USDC)", async function () {
                    const wethWholeTokenLiquidity = 1000000000;
                    const usdcWholeTokenLiquidity = 100000000;
                    const wethLiquidity = ethers.utils.parseUnits(wethWholeTokenLiquidity.toString(), 18);
                    const usdcLiquidity = ethers.utils.parseUnits(usdcWholeTokenLiquidity.toString(), 6);

                    await vault.stubSetBalance(poolId, WETH, wethLiquidity);
                    await vault.stubSetBalance(poolId, USDC, usdcLiquidity);

                    const liquidity = await accumulator.stubFetchLiquidity(WETH);
                    expect(liquidity[0]).to.equal(wethWholeTokenLiquidity);
                    expect(liquidity[1]).to.equal(usdcWholeTokenLiquidity);
                });
            });

            it("Should revert if the pool is paused", async function () {
                await pool.stubSetPaused(true);
                await expect(accumulator.stubFetchLiquidity(WETH)).to.be.revertedWith("PoolIsPaused");
            });

            it("Should revert if the token is not in the pool", async function () {
                await expect(accumulator.stubFetchLiquidity(BAL)).to.be.revertedWith("TokenNotFound");
            });
        });
    });
}

describeBalancerLiquidityAccumulatorTests("BalancerV2LiquidityAccumulator", "ArithmeticAveraging");
