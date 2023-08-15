const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60; // At most (optimistically) 60 seconds between every update
const DEFAULT_DECIMALS = 0;

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("CometSBAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("CometStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("CometSBAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy(USDC, 1, 1, 1);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        const accumulator = await accumulatorFactory.deploy(
            averagingStrategy.address,
            poolStub.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.comet()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.baseToken()).to.equal(USDC);
        expect(await accumulator.quoteTokenDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await accumulator.liquidityDecimals()).to.equal(DEFAULT_DECIMALS);
    });
});

describe("AaveV3SBAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("AaveV3PoolStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("AaveV3SBAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy(1, 1, 1);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        const accumulator = await accumulatorFactory.deploy(
            averagingStrategy.address,
            poolStub.address,
            DEFAULT_DECIMALS,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.aaveV3Pool()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await accumulator.liquidityDecimals()).to.equal(DEFAULT_DECIMALS);
    });
});

function describeSBAccumulatorTests(
    contractName,
    deployContracts,
    setSupply,
    setBorrow,
    tokensToTest,
    supportsBorrow = true,
    supportsStableBorrow = false
) {
    const decimalsToTest = [0, 4];

    const amountsToTest = [
        BigNumber.from(0),
        BigNumber.from(1),
        ethers.utils.parseUnits("1", 6), // 1M with 0 decimals
        ethers.utils.parseUnits("1", 9), // 1B with 0 decimals
    ];

    describe(contractName + "#fetchLiquidity", function () {
        var poolStub;
        var accumulator;
        var token;
        var decimals;

        function describeTests() {
            describe("Supply", function () {
                for (const supplyAmount of amountsToTest) {
                    it("Works for supply of " + supplyAmount.toString(), async function () {
                        await setSupply(poolStub, token, supplyAmount, decimals);

                        const updateData = ethers.utils.hexZeroPad(token, 32);
                        const result = await accumulator.stubFetchLiquidity(updateData);

                        // Allow for a 0.00001% difference
                        expect(result.tokenLiquidity).to.equal(0);
                        expect(result.quoteTokenLiquidity).to.be.closeTo(supplyAmount, supplyAmount.div(10000000));
                    });
                }
            });

            if (supportsBorrow) {
                describe("Borrow", function () {
                    for (const borrowAmount of amountsToTest) {
                        it("Works for borrow of " + borrowAmount.toString(), async function () {
                            await setBorrow(poolStub, token, borrowAmount, decimals);

                            const updateData = ethers.utils.hexZeroPad(token, 32);
                            const result = await accumulator.stubFetchLiquidity(updateData);

                            // Allow for a 0.00001% difference
                            expect(result.tokenLiquidity).to.be.closeTo(borrowAmount, borrowAmount.div(10000000));
                            expect(result.quoteTokenLiquidity).to.equal(0);
                        });
                    }
                });

                describe("Supply and borrow", function () {
                    for (const supplyAmount of amountsToTest) {
                        for (const borrowAmount of amountsToTest) {
                            it(
                                "Works for supply of " +
                                    supplyAmount.toString() +
                                    " and borrow of " +
                                    borrowAmount.toString(),
                                async function () {
                                    await setSupply(poolStub, token, supplyAmount, decimals);
                                    await setBorrow(poolStub, token, borrowAmount, decimals);

                                    const updateData = ethers.utils.hexZeroPad(token, 32);
                                    const result = await accumulator.stubFetchLiquidity(updateData);

                                    // Allow for a 0.00001% difference
                                    expect(result.tokenLiquidity).to.be.closeTo(
                                        borrowAmount,
                                        borrowAmount.div(10000000)
                                    );
                                    expect(result.quoteTokenLiquidity).to.be.closeTo(
                                        supplyAmount,
                                        supplyAmount.div(10000000)
                                    );
                                }
                            );
                        }
                    }
                });
            }

            if (supportsStableBorrow) {
                describe("Stable borrow", function () {
                    for (const borrowAmount of amountsToTest) {
                        it("Works for stable borrow of " + borrowAmount.toString(), async function () {
                            await setBorrow(poolStub, token, borrowAmount, decimals, true);

                            const updateData = ethers.utils.hexZeroPad(token, 32);
                            const result = await accumulator.stubFetchLiquidity(updateData);

                            // Allow for a 0.00001% difference
                            expect(result.tokenLiquidity).to.be.closeTo(borrowAmount, borrowAmount.div(10000000));
                            expect(result.quoteTokenLiquidity).to.equal(0);
                        });
                    }
                });

                describe("Stable borrow and variable borrow", function () {
                    for (const stableBorrowAmount of amountsToTest) {
                        for (const variableBorrowAmount of amountsToTest) {
                            it(
                                "Works for stable borrow of " +
                                    stableBorrowAmount.toString() +
                                    " and variable borrow of " +
                                    variableBorrowAmount.toString(),
                                async function () {
                                    await setBorrow(poolStub, token, variableBorrowAmount, decimals, false);
                                    await setBorrow(poolStub, token, stableBorrowAmount, decimals, true);

                                    const updateData = ethers.utils.hexZeroPad(token, 32);
                                    const result = await accumulator.stubFetchLiquidity(updateData);

                                    const totalBorrowAmount = stableBorrowAmount.add(variableBorrowAmount);

                                    // Allow for a 0.00001% difference
                                    expect(result.tokenLiquidity).to.be.closeTo(
                                        totalBorrowAmount,
                                        totalBorrowAmount.div(10000000)
                                    );
                                    expect(result.quoteTokenLiquidity).to.equal(0);
                                }
                            );
                        }
                    }
                });

                describe("Supply, stable borrow, and variable borrow", function () {
                    for (const supplyAmount of amountsToTest) {
                        for (const stableBorrowAmount of amountsToTest) {
                            for (const variableBorrowAmount of amountsToTest) {
                                it(
                                    "Works for supply of " +
                                        supplyAmount.toString() +
                                        ", stable borrow of " +
                                        stableBorrowAmount.toString() +
                                        ", and variable borrow of " +
                                        variableBorrowAmount.toString(),
                                    async function () {
                                        await setSupply(poolStub, token, supplyAmount, decimals);
                                        await setBorrow(poolStub, token, variableBorrowAmount, decimals, false);
                                        await setBorrow(poolStub, token, stableBorrowAmount, decimals, true);

                                        const updateData = ethers.utils.hexZeroPad(token, 32);
                                        const result = await accumulator.stubFetchLiquidity(updateData);

                                        const totalBorrowAmount = stableBorrowAmount.add(variableBorrowAmount);

                                        // Allow for a 0.00001% difference
                                        expect(result.tokenLiquidity).to.be.closeTo(
                                            totalBorrowAmount,
                                            totalBorrowAmount.div(10000000)
                                        );
                                        expect(result.quoteTokenLiquidity).to.be.closeTo(
                                            supplyAmount,
                                            supplyAmount.div(10000000)
                                        );
                                    }
                                );
                            }
                        }
                    }
                });
            }
        }

        function describeTestsForTokens() {
            for (const tokenToTest of tokensToTest) {
                describe("With " + tokenToTest.name, function () {
                    beforeEach(async function () {
                        token = tokenToTest.address;
                        const contracts = await deployContracts(token, decimals);
                        poolStub = contracts.poolStub;
                        accumulator = contracts.accumulator;
                    });

                    describeTests();
                });
            }
        }

        for (const d of decimalsToTest) {
            describe("With " + d + " decimals", function () {
                beforeEach(async function () {
                    decimals = d;
                });

                describeTestsForTokens();
            });
        }
    });
}

function createCometDeploymentFunction(fixedBaseToken = undefined) {
    return async function deployCometContracts(baseToken, decimals) {
        const poolStubFactory = await ethers.getContractFactory("CometStub");
        const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        const accumulatorFactory = await ethers.getContractFactory("CometSBAccumulatorStub");

        const poolStub = await poolStubFactory.deploy(fixedBaseToken ?? baseToken, 1, 1, 1);
        await poolStub.deployed();

        const averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();

        const accumulator = await accumulatorFactory.deploy(
            averagingStrategy.address,
            poolStub.address,
            decimals,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        return {
            poolStub: poolStub,
            accumulator: accumulator,
        };
    };
}

async function deployAaveV3Contracts(baseToken, decimals) {
    const poolStubFactory = await ethers.getContractFactory("AaveV3PoolStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("AaveV3SBAccumulatorStub");

    const poolStub = await poolStubFactory.deploy(1, 1, 1);
    await poolStub.deployed();

    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const accumulator = await accumulatorFactory.deploy(
        averagingStrategy.address,
        poolStub.address,
        decimals,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );

    const tokenContract = await ethers.getContractAt("IERC20Metadata", baseToken);
    const tokenDecimals = await tokenContract.decimals();

    const tokenFactory = await ethers.getContractFactory("FakeERC20B");
    const aToken = await tokenFactory.deploy("aToken", "aToken", tokenDecimals);
    const variableDebtToken = await tokenFactory.deploy("vdToken", "vdToken", tokenDecimals);
    const stableDebtToken = await tokenFactory.deploy("sdToken", "sdToken", tokenDecimals);

    await aToken.deployed();
    await variableDebtToken.deployed();
    await stableDebtToken.deployed();

    await poolStub.setCollateralToken(baseToken, aToken.address);
    await poolStub.setVariableDebtToken(baseToken, variableDebtToken.address);
    await poolStub.setStableDebtToken(baseToken, stableDebtToken.address);

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

async function cometSetSupply(stub, token, amount, decimals) {
    const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
    const tokenDecimals = await tokenContract.decimals();

    const rawAmount = ethers.utils.parseUnits(amount.toString(), tokenDecimals - decimals);

    const baseToken = await stub.baseToken();
    if (token === baseToken) {
        await stub.stubSetTotalSupply(rawAmount);
    } else {
        await stub.stubSetTotalsCollateral(token, rawAmount);
    }
}

async function cometSetSBorrow(stub, token, amount, decimals) {
    const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
    const tokenDecimals = await tokenContract.decimals();

    const rawAmount = ethers.utils.parseUnits(amount.toString(), tokenDecimals - decimals);

    const baseToken = await stub.baseToken();
    if (token === baseToken) {
        await stub.stubSetTotalBorrow(rawAmount);
    }
}

async function aaveV3SetSupply(stub, token, amount, decimals) {
    const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
    const tokenDecimals = await tokenContract.decimals();

    const reserveData = await stub.getReserveData(token);
    const aToken = await ethers.getContractAt("FakeERC20B", reserveData.aTokenAddress);
    await aToken.mint(stub.address, ethers.utils.parseUnits(amount.toString(), tokenDecimals - decimals));
}

async function aaveV3SetBorrow(stub, token, amount, decimals, stable) {
    const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
    const tokenDecimals = await tokenContract.decimals();

    const reserveData = await stub.getReserveData(token);

    var debtToken;

    if (stable) {
        debtToken = await ethers.getContractAt("FakeERC20B", reserveData.stableDebtTokenAddress);
    } else {
        debtToken = await ethers.getContractAt("FakeERC20B", reserveData.variableDebtTokenAddress);
    }

    await debtToken.mint(stub.address, ethers.utils.parseUnits(amount.toString(), tokenDecimals - decimals));
}

const _WETH = {
    name: "WETH",
    address: WETH,
};

const _USDC = {
    name: "USDC",
    address: USDC,
};

describeSBAccumulatorTests(
    "[base] CometSBAccumulator",
    createCometDeploymentFunction(),
    cometSetSupply,
    cometSetSBorrow,
    [_WETH, _USDC],
    true // Base matches the token to test, so we can always borrow
);
describeSBAccumulatorTests(
    "[collateral=WETH] CometSBAccumulator",
    createCometDeploymentFunction(WETH),
    cometSetSupply,
    cometSetSBorrow,
    [_USDC],
    false // We can only supply the token to test
);
describeSBAccumulatorTests(
    "[collateral=USDC] CometSBAccumulator",
    createCometDeploymentFunction(USDC),
    cometSetSupply,
    cometSetSBorrow,
    [_WETH],
    false // We can only supply the token to test
);
describeSBAccumulatorTests(
    "AaveV3SBAccumulator",
    deployAaveV3Contracts,
    aaveV3SetSupply,
    aaveV3SetBorrow,
    [_WETH, _USDC],
    true,
    true
);
