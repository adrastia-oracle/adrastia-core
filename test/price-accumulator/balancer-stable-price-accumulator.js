const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

// Contains BPT: false
// Contains linear pool: false
const BALANCER_rETH_WETH_POOL_ID = "0x1e19cf2d73a72ef1332c882f20534b6519be0276000200000000000000000112";

// Pool address: 0xfeBb0bbf162E64fb9D0dfe186E517d84C395f016
// Contains BPT: true (index 3)
// Contains linear pool: true (all tokens)
const BALANCER_BOOSTED_AAVE_V3_USD_POOL_ID = "0xfebb0bbf162e64fb9d0dfe186e517d84c395f016000000000000000000000502";

// Pool address: 0x79c58f70905F734641735BC61e45c19dD9Ad60bC
// Contains BPT: true (index 1)
// Contains linear pool: false
// Tokens: DAI (index 0), BPT (index 1), USDC (index 2), USDT (index 3)
// Scaling factors: 1000000000000000000, 1000000000000000000, 1000000000000000000000000000000, 1000000000000000000000000000000
const BALANCER_USDC_DAI_USDT_POOL_ID = "0x79c58f70905f734641735bc61e45c19dd9ad60bc0000000000000000000004e7";

// Scales a token that has 18 decimal places to 36 decimal places
const SCALING_FACTOR_18 = BigNumber.from("1000000000000000000");

// Scales a token that has 6 decimal places to 36 decimal places
const SCALING_FACTOR_6 = BigNumber.from("1000000000000000000000000000000");

const PRECISION_FACTOR = 1000; // 0.1%

// Precision factor that works with < 1000 whole tokens
const PRECISION_FACTOR_TINY_BALANCES = 100; // 1%

const DEFAULT_AMPLIFICATION = BigNumber.from("2000000");

const rETH = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const aUSDC = "0x9bA00D6856a4eDF4665BcA2C2309936572473B7E";
const aWETH = "0x030bA81f1c18d280636F32af80b9AAd02Cf0854e";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BAL = "0xba100000625a3754423978a60c9317c58a424e3D";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const UNI = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2%
const DEFAULT_UPDATE_DELAY = 1;
const DEFAULT_HEARTBEAT = 100;

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

    const scalingFactors = tokens.map((token) => token.scalingFactor);

    await pool.stubSetScalingFactors(scalingFactors);

    const tokenAddresses = tokens.map((token) => token.address);

    await vault.stubRegisterPool(poolId, pool.address, tokenAddresses);

    return pool;
}

async function deployStablePool(vault, poolId, tokens) {
    const tokenAddresses = tokens.map((token) => token.address);
    const scalingFactors = tokens.map((token) => token.scalingFactor);

    const poolFactory = await ethers.getContractFactory("BalancerStablePoolStub");
    const pool = await poolFactory.deploy(poolId, scalingFactors);
    await pool.deployed();

    await vault.stubRegisterPool(poolId, pool.address, tokenAddresses);

    return pool;
}

async function deployStablePoolWithBPTAtIndex(vault, poolId, tokens, bptIndex) {
    const tokenAddresses = tokens.map((token) => token.address);
    const scalingFactors = tokens.map((token) => token.scalingFactor);

    // Insert the scaling factor for the BPT at the correct index
    scalingFactors.splice(bptIndex, 0, SCALING_FACTOR_18);

    const poolFactory = await ethers.getContractFactory("BalancerStablePoolStub");
    const pool = await poolFactory.deploy(poolId, scalingFactors);
    await pool.deployed();

    await pool.stubSetBptIndex(bptIndex);

    // Insert the pool address at the correct index
    tokenAddresses.splice(bptIndex, 0, pool.address);

    await vault.stubRegisterPool(poolId, pool.address, tokenAddresses);

    return pool;
}

function createDeployStablePoolWithBPTAtIndex(bptIndex) {
    const bptIndexCpy = bptIndex;

    return async function (vault, poolId, tokens) {
        return deployStablePoolWithBPTAtIndex(vault, poolId, tokens, bptIndexCpy);
    };
}

async function deployDefaultAccumulator(
    vault,
    averagingStrategyName,
    quoteToken,
    tokens,
    deployPoolFunc = deployStablePool
) {
    const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const poolId = ethers.utils.solidityKeccak256(["address", "address"], [quoteToken, ethers.constants.AddressZero]);

    const pool = await deployPoolFunc(vault, poolId, tokens);

    const accumulatorFactory = await ethers.getContractFactory("BalancerV2StablePriceAccumulatorStub");
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

function describeBalancerStablePriceAccumulatorTests(contractName, averagingStrategyName) {
    describe(contractName + " using " + averagingStrategyName, function () {
        describe(contractName + "#constructor", function () {
            it("Should deploy successfully with a simple stable pool", async function () {
                const vault = await deployVault();

                const tokens = [
                    {
                        address: WETH,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: USDC,
                        scalingFactor: SCALING_FACTOR_6,
                    },
                ];

                const deployment = await deployDefaultAccumulator(
                    vault,
                    averagingStrategyName,
                    USDC,
                    tokens,
                    deployStablePool
                );

                expect(await deployment.accumulator.poolId()).to.equal(deployment.poolId);
                expect(await deployment.accumulator.quoteToken()).to.equal(USDC);
                expect(await deployment.accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
                expect(await deployment.accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
                expect(await deployment.accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
                expect(await deployment.accumulator.averagingStrategy()).to.equal(deployment.averagingStrategy.address);
                expect(await deployment.accumulator.balancerVault()).to.equal(deployment.vault.address);
                expect(await deployment.accumulator.poolAddress()).to.equal(deployment.pool.address);
            });

            it("Should deploy successfully with a stable pool and our token is inside of a linear pool", async function () {
                const vault = await deployVault();

                const linearPoolTokens = [
                    {
                        address: WETH,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: aWETH,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                ];
                const linearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                const tokens = [
                    {
                        address: linearPool.address,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: USDC,
                        scalingFactor: SCALING_FACTOR_6,
                    },
                ];

                const deployment = await deployDefaultAccumulator(
                    vault,
                    averagingStrategyName,
                    USDC,
                    tokens,
                    deployStablePool
                );

                expect(await deployment.accumulator.poolId()).to.equal(deployment.poolId);
                expect(await deployment.accumulator.quoteToken()).to.equal(USDC);
                expect(await deployment.accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
                expect(await deployment.accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
                expect(await deployment.accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
                expect(await deployment.accumulator.averagingStrategy()).to.equal(deployment.averagingStrategy.address);
                expect(await deployment.accumulator.balancerVault()).to.equal(deployment.vault.address);
                expect(await deployment.accumulator.poolAddress()).to.equal(deployment.pool.address);
            });

            it("Should deploy successfully with a stable pool and our quote token is inside of a linear pool", async function () {
                const vault = await deployVault();

                const linearPoolTokens = [
                    {
                        address: aUSDC,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: USDC,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                ];
                const linearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                const tokens = [
                    {
                        address: linearPool.address,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: WETH,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                ];

                const deployment = await deployDefaultAccumulator(
                    vault,
                    averagingStrategyName,
                    USDC,
                    tokens,
                    deployStablePool
                );

                expect(await deployment.accumulator.poolId()).to.equal(deployment.poolId);
                expect(await deployment.accumulator.quoteToken()).to.equal(USDC);
                expect(await deployment.accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
                expect(await deployment.accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
                expect(await deployment.accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
                expect(await deployment.accumulator.averagingStrategy()).to.equal(deployment.averagingStrategy.address);
                expect(await deployment.accumulator.balancerVault()).to.equal(deployment.vault.address);
                expect(await deployment.accumulator.poolAddress()).to.equal(deployment.pool.address);
            });

            it("Should revert when the quote token is not in the pool (using a simple stable pool)", async function () {
                const vault = await deployVault();

                const tokens = [
                    {
                        address: WETH,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: BAL,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                ];

                await expect(
                    deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens, deployStablePool)
                ).to.be.revertedWith('TokenNotFound("' + USDC + '")');
            });

            it("Should revert when the quote token is not in the pool (using a stable pool with one linear pool)", async function () {
                const vault = await deployVault();

                const linearPoolTokens = [
                    {
                        address: aWETH,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: WETH,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                ];
                const linearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                const tokens = [
                    {
                        address: linearPool.address,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                    {
                        address: BAL,
                        scalingFactor: SCALING_FACTOR_18,
                    },
                ];

                await expect(
                    deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens, deployStablePool)
                ).to.be.revertedWith('TokenNotFound("' + USDC + '")');
            });
        });

        describe(contractName + "#canUpdate", function () {
            describe("With a simple stable pool", function () {
                var accumulator;
                var vault;
                var pool;
                var poolId;

                beforeEach(async () => {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
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

                it("Should return false when the token is the zero address", async function () {
                    expect(
                        await accumulator.canUpdate(ethers.utils.hexZeroPad(ethers.constants.AddressZero, 32))
                    ).to.equal(false);
                });

                it("Should return false when the token is the quote token", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(USDC, 32))).to.equal(false);
                });

                it("Should return false when the pool is in recovery mode", async function () {
                    await pool.stubSetRecoveryMode(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when recovery mode is off
                    await pool.stubSetRecoveryMode(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return false when the token balance is zero", async function () {
                    await vault.stubSetBalance(poolId, WETH, 0);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);
                });

                it("Should return false when the quote token balance is zero", async function () {
                    await vault.stubSetBalance(poolId, USDC, 0);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);
                });

                it("Should return false when both the token balances are zero", async function () {
                    await vault.stubSetBalance(poolId, WETH, 0);
                    await vault.stubSetBalance(poolId, USDC, 0);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);
                });
            });

            describe("With stable pool and the token is inside of a linear pool", function () {
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
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    linearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                    const tokens = [
                        {
                            address: linearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    const linearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(linearPoolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, USDC, ethers.utils.parseUnits("1000.0", 6));
                    await vault.stubSetBalance(poolId, linearPool.address, ethers.utils.parseUnits("1000.0", 18));
                });

                it("Should return false when given token that's not in the pool", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(BAL, 32))).to.equal(false);
                });

                it("Should return true when given a token that's in the pool", async function () {
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

                it("Should return false when the pool is in recovery mode", async function () {
                    await pool.stubSetRecoveryMode(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when recovery mode is off
                    await pool.stubSetRecoveryMode(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return false when the linear pool is in recovery mode", async function () {
                    await linearPool.stubSetRecoveryMode(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when recovery mode is off
                    await linearPool.stubSetRecoveryMode(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });
            });

            describe("With stable pool and the quote token is inside of a linear pool", function () {
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
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    linearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                    const tokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: linearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    const linearPoolId = await linearPool.getPoolId();

                    await vault.stubSetBalance(poolId, WETH, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(poolId, linearPool.address, ethers.utils.parseUnits("1000.0", 18));
                    await vault.stubSetBalance(linearPoolId, USDC, ethers.utils.parseUnits("1000.0", 6));
                });

                it("Should return false when given token that's not in the pool", async function () {
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(BAL, 32))).to.equal(false);
                });

                it("Should return true when given a token that's in the pool", async function () {
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

                it("Should return false when the pool is in recovery mode", async function () {
                    await pool.stubSetRecoveryMode(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when recovery mode is off
                    await pool.stubSetRecoveryMode(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });

                it("Should return false when the linear pool is in recovery mode", async function () {
                    await linearPool.stubSetRecoveryMode(true);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(false);

                    // Sanity check: Returns true when recovery mode is off
                    await linearPool.stubSetRecoveryMode(false);
                    expect(await accumulator.canUpdate(ethers.utils.hexZeroPad(WETH, 32))).to.equal(true);
                });
            });
        });

        describe(contractName + "#fetchPrice", function () {
            var accumulator;
            var vault;
            var pool;
            var poolId;

            var wethLinearPool;
            var usdcLinearPool;

            var wethPoolId;
            var usdcPoolId;

            beforeEach(async function () {
                wethLinearPool = undefined;
                usdcLinearPool = undefined;
            });

            function expectEqualsWithTolerance(actual, expected, tolerance) {
                const allowedDifference = expected.div(tolerance);

                expect(actual).to.be.closeTo(expected, allowedDifference);
            }

            function describeCommonTests(
                balancedPrice = BigNumber.from(1000000),
                lesserPrice = BigNumber.from(992578),
                greaterPrice = BigNumber.from(1007461),
                wethLinearPoolRate = ethers.utils.parseUnits("1.0", 18),
                usdcLinearPoolRate = ethers.utils.parseUnits("1.0", 18)
            ) {
                it("Should return the correct price when balanced", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("1000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = balancedPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR);
                });

                it("Should return the correct price when there's a more quote tokens than tokens", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("10000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = greaterPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR);
                });

                it("Should return the correct price when there's a less quote tokens than tokens", async function () {
                    const wethBalance = ethers.utils.parseUnits("10000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("1000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = lesserPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR);
                });

                it("Should return the correct price when balanced (with tiny balances)", async function () {
                    const wethBalance = ethers.utils.parseUnits("10.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("10.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = balancedPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR_TINY_BALANCES);
                });

                it("Should return the correct price when there's a more quote tokens than tokens (with tiny balances)", async function () {
                    const wethBalance = ethers.utils.parseUnits("10.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("100.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = greaterPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR_TINY_BALANCES);
                });

                it("Should return the correct price when there's a less quote tokens than tokens (with tiny balances)", async function () {
                    const wethBalance = ethers.utils.parseUnits("100.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("10.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = lesserPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR_TINY_BALANCES);
                });

                it("Should return the correct price when balanced (with large balances)", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000000000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("1000000000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = balancedPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR);
                });

                it("Should return the correct price when there's a more quote tokens than tokens (with large balances)", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000000000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("10000000000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = greaterPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR);
                });

                it("Should return the correct price when there's a less quote tokens than tokens (with large balances)", async function () {
                    const wethBalance = ethers.utils.parseUnits("10000000000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("1000000000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = lesserPrice;

                    const price = await accumulator.stubFetchPrice(WETH);
                    expectEqualsWithTolerance(price, expectedPrice, PRECISION_FACTOR);
                });

                it("Reverts if the pool is in recovery mode", async function () {
                    await pool.stubSetRecoveryMode(true);

                    await expect(accumulator.stubFetchPrice(WETH)).to.be.revertedWith("PoolInRecoveryMode");
                });

                it("Reverts if the token balance is zero", async function () {
                    const wethBalance = BigNumber.from(0);
                    const usdcBalance = ethers.utils.parseUnits("1000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    await expect(accumulator.stubFetchPrice(WETH)).to.be.reverted;
                });

                it("Reverts if the quote token balance is zero", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000.0", 18);
                    const usdcBalance = BigNumber.from(0);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    await expect(accumulator.stubFetchPrice(WETH)).to.be.reverted;
                });

                it("Reverts if both token balances are zero", async function () {
                    const wethBalance = BigNumber.from(0);
                    const usdcBalance = BigNumber.from(0);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(wethLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(usdcLinearPoolRate);
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    await expect(accumulator.stubFetchPrice(WETH)).to.be.reverted;
                });

                it("Reverts if the token is not in the pool", async function () {
                    await expect(accumulator.stubFetchPrice(BAL)).to.be.revertedWith("TokenNotFound");
                });
            }

            describe("Two tokens, without a BPT token", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests();
            });

            describe("Two tokens, with a BPT token at index 0", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployPoolFunc = createDeployStablePoolWithBPTAtIndex(0);

                    const deployment = await deployDefaultAccumulator(
                        vault,
                        averagingStrategyName,
                        USDC,
                        tokens,
                        deployPoolFunc
                    );
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests();
            });

            describe("Two tokens, with a BPT token at index 1", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployPoolFunc = createDeployStablePoolWithBPTAtIndex(1);

                    const deployment = await deployDefaultAccumulator(
                        vault,
                        averagingStrategyName,
                        USDC,
                        tokens,
                        deployPoolFunc
                    );
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests();
            });

            describe("Two tokens, with a BPT token at index 2", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployPoolFunc = createDeployStablePoolWithBPTAtIndex(2);

                    const deployment = await deployDefaultAccumulator(
                        vault,
                        averagingStrategyName,
                        USDC,
                        tokens,
                        deployPoolFunc
                    );
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests();
            });

            describe("Two tokens, with the token in a linear pool", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: aWETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];
                    wethLinearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                    const tokens = [
                        {
                            address: wethLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = await wethLinearPool.getPoolId();
                    usdcPoolId = poolId;
                });

                describeCommonTests();

                it("Reverts if the token linear pool is in recovery mode", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("1000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(ethers.utils.parseUnits("1.0", 18));
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(ethers.utils.parseUnits("1.0", 18));
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    await wethLinearPool.stubSetRecoveryMode(true);

                    await expect(accumulator.stubFetchPrice(WETH)).to.be.revertedWith("PoolInRecoveryMode");
                });
            });

            describe("Two tokens, with the token in a linear pool and the token's rate is half", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: aWETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];
                    wethLinearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                    const tokens = [
                        {
                            address: wethLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = await wethLinearPool.getPoolId();
                    usdcPoolId = poolId;
                });

                describeCommonTests(
                    BigNumber.from(2000000),
                    BigNumber.from(1985142),
                    BigNumber.from(2014908),
                    ethers.utils.parseUnits("0.5", 18), // token rate
                    ethers.utils.parseUnits("1.0", 18) // quote token rate
                );
            });

            describe("Two tokens, with the token in a linear pool and the token's rate is double", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: aWETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];
                    wethLinearPool = await deployLinearPool(vault, WETH, linearPoolTokens);

                    const tokens = [
                        {
                            address: wethLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = await wethLinearPool.getPoolId();
                    usdcPoolId = poolId;
                });

                describeCommonTests(
                    BigNumber.from(500000),
                    BigNumber.from(496291),
                    BigNumber.from(503732),
                    ethers.utils.parseUnits("2.0", 18), // token rate
                    ethers.utils.parseUnits("1.0", 18) // quote token rate
                );
            });

            describe("Two tokens, with the quote token in a linear pool", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: aUSDC,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];
                    usdcLinearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                    const tokens = [
                        {
                            address: usdcLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = await usdcLinearPool.getPoolId();
                });

                describeCommonTests();

                it("Reverts if the quote token linear pool is in recovery mode", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("1000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(ethers.utils.parseUnits("1.0", 18));
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(ethers.utils.parseUnits("1.0", 18));
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    await usdcLinearPool.stubSetRecoveryMode(true);

                    await expect(accumulator.stubFetchPrice(WETH)).to.be.revertedWith("PoolInRecoveryMode");
                });

                it("Should return 1 if the quote token linear pool's rate is 0", async function () {
                    const wethBalance = ethers.utils.parseUnits("1000.0", 18);
                    const usdcBalance = ethers.utils.parseUnits("1000.0", 6);

                    await vault.stubSetBalance(wethPoolId, WETH, wethBalance);
                    await vault.stubSetBalance(usdcPoolId, USDC, usdcBalance);

                    if (wethLinearPool !== undefined) {
                        const linearPoolId = await wethLinearPool.getPoolId();

                        await wethLinearPool.stubSetRate(ethers.utils.parseUnits("1.0", 18));
                        await vault.stubSetBalance(linearPoolId, WETH, wethBalance);
                        await vault.stubSetBalance(poolId, wethLinearPool.address, wethBalance);
                    }
                    if (usdcLinearPool !== undefined) {
                        const linearPoolId = await usdcLinearPool.getPoolId();

                        await usdcLinearPool.stubSetRate(BigNumber.from(0));
                        await vault.stubSetBalance(linearPoolId, USDC, usdcBalance);
                        // Note: We multiply the balance by 10^12 because the linear pool has 18 decimals
                        await vault.stubSetBalance(
                            poolId,
                            usdcLinearPool.address,
                            usdcBalance.mul(BigNumber.from(10).pow(12))
                        );
                    }

                    await pool.stubSetAmplificationParameter(DEFAULT_AMPLIFICATION, false);

                    const expectedPrice = BigNumber.from(1);

                    const price = await accumulator.stubFetchPrice(WETH);
                    expect(price).to.equal(expectedPrice);
                });
            });

            describe("Two tokens, with the quote token in a linear pool and the quote token's rate is half", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: aUSDC,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];
                    usdcLinearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                    const tokens = [
                        {
                            address: usdcLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = await usdcLinearPool.getPoolId();
                });

                describeCommonTests(
                    BigNumber.from(500000),
                    BigNumber.from(496291),
                    BigNumber.from(503732),
                    ethers.utils.parseUnits("1.0", 18), // token rate
                    ethers.utils.parseUnits("0.5", 18) // quote token rate
                );
            });

            describe("Two tokens, with the quote token in a linear pool and the quote token's rate is double", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const linearPoolTokens = [
                        {
                            address: aUSDC,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];
                    usdcLinearPool = await deployLinearPool(vault, USDC, linearPoolTokens);

                    const tokens = [
                        {
                            address: usdcLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = await usdcLinearPool.getPoolId();
                });

                describeCommonTests(
                    BigNumber.from(2000000),
                    BigNumber.from(1985142),
                    BigNumber.from(2014908),
                    ethers.utils.parseUnits("1.0", 18), // token rate
                    ethers.utils.parseUnits("2.0", 18) // quote token rate
                );
            });

            describe("Two tokens, with both tokens inside of linear pools", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const usdcLinearPoolTokens = [
                        {
                            address: aUSDC,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                    ];
                    usdcLinearPool = await deployLinearPool(vault, USDC, usdcLinearPoolTokens);

                    const wethLinearPoolTokens = [
                        {
                            address: aWETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];
                    wethLinearPool = await deployLinearPool(vault, WETH, wethLinearPoolTokens);

                    const tokens = [
                        {
                            address: usdcLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                        {
                            address: wethLinearPool.address,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = await wethLinearPool.getPoolId();
                    usdcPoolId = await usdcLinearPool.getPoolId();
                });

                describeCommonTests();
            });

            describe("Two tokens, with both scaling factors multiplied by 2", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6.mul(2),
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18.mul(2),
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests();
            });

            describe("Two tokens, with both scaling factors divided by 2", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6.div(2),
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18.div(2),
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests();
            });

            describe("Two tokens, with the WETH scaling factor multiplied by 2", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18.mul(2),
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests(BigNumber.from(2000000), BigNumber.from(1946633), BigNumber.from(2004310));
            });

            describe("Two tokens, with the USDC scaling factor divided by 2", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6.div(2),
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests(BigNumber.from(2000000), BigNumber.from(1946633), BigNumber.from(2004310));
            });

            describe("Two tokens, with the WETH scaling factor divided by 2", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6,
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18.div(2),
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests(BigNumber.from(500000), BigNumber.from(498923), BigNumber.from(513680));
            });

            describe("Two tokens, with the USDC scaling factor multiplied by 2", function () {
                beforeEach(async function () {
                    vault = await deployVault();

                    const tokens = [
                        {
                            address: USDC,
                            scalingFactor: SCALING_FACTOR_6.mul(2),
                        },
                        {
                            address: WETH,
                            scalingFactor: SCALING_FACTOR_18,
                        },
                    ];

                    const deployment = await deployDefaultAccumulator(vault, averagingStrategyName, USDC, tokens);
                    accumulator = deployment.accumulator;
                    vault = deployment.vault;
                    pool = deployment.pool;
                    poolId = deployment.poolId;

                    wethPoolId = poolId;
                    usdcPoolId = poolId;
                });

                describeCommonTests(BigNumber.from(500000), BigNumber.from(498923), BigNumber.from(513680));
            });
        });
    });
}

describeBalancerStablePriceAccumulatorTests("BalancerV2StablePriceAccumulator", "ArithmeticAveraging");
