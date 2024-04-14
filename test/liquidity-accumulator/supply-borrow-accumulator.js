const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

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

function getRandomHex(length) {
    let result = "";
    const characters = "0123456789abcdef";
    const charactersLength = characters.length;

    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
}

function getRandomBigNumber(nBits) {
    if (nBits == 0) {
        return BigNumber.from(0);
    }

    const hexLength = nBits / 4; // Each hex digit represents 4 bits
    const randomHexValue = getRandomHex(hexLength);
    const randomValue = BigNumber.from("0x" + randomHexValue);

    return randomValue;
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

describe("IonicSBAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("IonicStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("IonicSBAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy();
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
        expect(await accumulator.comptroller()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await accumulator.liquidityDecimals()).to.equal(DEFAULT_DECIMALS);
    });
});

describe("CompoundV2SBAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("IonicStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("CompoundV2SBAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy();
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
        expect(await accumulator.comptroller()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await accumulator.liquidityDecimals()).to.equal(DEFAULT_DECIMALS);
    });
});

describe("CompoundV2SBAccumulator#refreshTokenMappings", function () {
    var poolStub;
    var accumulator;
    var cTokenFactory;

    before(async function () {
        cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
    });

    beforeEach(async function () {
        const contracts = await deployCompoundV2Contracts(WETH, DEFAULT_DECIMALS);
        poolStub = contracts.poolStub;
        accumulator = contracts.accumulator;

        // Remove all markets and refresh the mapping
        await poolStub.stubRemoveAllMarkets();
        await accumulator.refreshTokenMappings();
    });

    it("Reverts if there are two markets for a single underlying token", async function () {
        const usdcCToken1 = await cTokenFactory.deploy(USDC);
        await usdcCToken1.deployed();
        const usdcCToken2 = await cTokenFactory.deploy(USDC);
        await usdcCToken2.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken1.address);
        await poolStub["stubAddMarket(address)"](usdcCToken2.address);

        await expect(accumulator.refreshTokenMappings()).to.be.revertedWith("DuplicateMarket");
    });

    it("Reverts if the same market is listed twice", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address,bool,bool)"](usdcCToken.address, false, true);

        await expect(accumulator.refreshTokenMappings()).to.be.revertedWith("DuplicateMarket");
    });

    it("Reverts if two different CEther tokens are listed", async function () {
        const cEther1 = await cTokenFactory.deploy(WETH);
        await cEther1.deployed();
        const cEther2 = await cTokenFactory.deploy(WETH);
        await cEther2.deployed();

        await cEther1.stubSetIsCEther(true);
        await cEther2.stubSetIsCEther(true);

        await poolStub["stubAddMarket(address)"](cEther1.address);
        await poolStub["stubAddMarket(address)"](cEther2.address);

        await expect(accumulator.refreshTokenMappings()).to.be.revertedWith("DuplicateMarket");
    });

    it("Discovers one market - WETH", async function () {
        const cToken = await cTokenFactory.deploy(WETH);
        await cToken.deployed();

        await poolStub["stubAddMarket(address)"](cToken.address);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(accumulator, "CTokenAdded").withArgs(cToken.address);
        expect(receipt.events.length).to.equal(2);

        const tokenInfo = await accumulator.tokenInfo(WETH);
        expect(tokenInfo.cToken).to.equal(cToken.address);
        expect(tokenInfo.underlyingDecimals).to.equal(18);
    });

    it("Discovers one market - USDC", async function () {
        const cToken = await cTokenFactory.deploy(USDC);
        await cToken.deployed();

        await poolStub["stubAddMarket(address)"](cToken.address);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(accumulator, "CTokenAdded").withArgs(cToken.address);
        expect(receipt.events.length).to.equal(2);

        const tokenInfo = await accumulator.tokenInfo(USDC);
        expect(tokenInfo.cToken).to.equal(cToken.address);
        expect(tokenInfo.underlyingDecimals).to.equal(6);
    });

    it("Discovers two markets - USDC and WETH", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address)"](wethCToken.address);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(2, 0);
        expect(refreshTx).to.emit(accumulator, "CTokenAdded").withArgs(usdcCToken.address);
        expect(refreshTx).to.emit(accumulator, "CTokenAdded").withArgs(wethCToken.address);
        expect(receipt.events.length).to.equal(3);

        const usdcTokenInfo = await accumulator.tokenInfo(USDC);
        expect(usdcTokenInfo.cToken).to.equal(usdcCToken.address);
        expect(usdcTokenInfo.underlyingDecimals).to.equal(6);

        const wethTokenInfo = await accumulator.tokenInfo(WETH);
        expect(wethTokenInfo.cToken).to.equal(wethCToken.address);
        expect(wethTokenInfo.underlyingDecimals).to.equal(18);
    });

    it("Discovers one new market", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await accumulator.refreshTokenMappings();

        await poolStub["stubAddMarket(address)"](wethCToken.address);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(accumulator, "CTokenAdded").withArgs(wethCToken.address);
        expect(receipt.events.length).to.equal(2);

        const usdcTokenInfo = await accumulator.tokenInfo(USDC);
        expect(usdcTokenInfo.cToken).to.equal(usdcCToken.address);
        expect(usdcTokenInfo.underlyingDecimals).to.equal(6);

        const wethTokenInfo = await accumulator.tokenInfo(WETH);
        expect(wethTokenInfo.cToken).to.equal(wethCToken.address);
        expect(wethTokenInfo.underlyingDecimals).to.equal(18);
    });

    it("Discovers the removal of a market", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address)"](wethCToken.address);
        await accumulator.refreshTokenMappings();

        await poolStub["stubRemoveMarket(address)"](usdcCToken.address);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(0, 1);
        expect(refreshTx).to.emit(accumulator, "CTokenRemoved").withArgs(usdcCToken.address);
        expect(receipt.events.length).to.equal(2);

        const usdcTokenInfo = await accumulator.tokenInfo(USDC);
        expect(usdcTokenInfo.cToken).to.equal(ethers.constants.AddressZero);
        expect(usdcTokenInfo.underlyingDecimals).to.equal(0);

        const wethTokenInfo = await accumulator.tokenInfo(WETH);
        expect(wethTokenInfo.cToken).to.equal(wethCToken.address);
        expect(wethTokenInfo.underlyingDecimals).to.equal(18);
    });

    it("Discovers the removal of all markets", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await poolStub["stubAddMarket(address)"](wethCToken.address);
        await accumulator.refreshTokenMappings();

        await poolStub.stubRemoveAllMarkets();
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(0, 2);
        expect(refreshTx).to.emit(accumulator, "CTokenRemoved").withArgs(usdcCToken.address);
        expect(refreshTx).to.emit(accumulator, "CTokenRemoved").withArgs(wethCToken.address);
        expect(receipt.events.length).to.equal(3);

        const usdcTokenInfo = await accumulator.tokenInfo(USDC);
        expect(usdcTokenInfo.cToken).to.equal(ethers.constants.AddressZero);
        expect(usdcTokenInfo.underlyingDecimals).to.equal(0);

        const wethTokenInfo = await accumulator.tokenInfo(WETH);
        expect(wethTokenInfo.cToken).to.equal(ethers.constants.AddressZero);
        expect(wethTokenInfo.underlyingDecimals).to.equal(0);
    });

    it("Discovers the additon and removal of markets", async function () {
        const usdcCToken = await cTokenFactory.deploy(USDC);
        await usdcCToken.deployed();
        const wethCToken = await cTokenFactory.deploy(WETH);
        await wethCToken.deployed();

        await poolStub["stubAddMarket(address)"](usdcCToken.address);
        await accumulator.refreshTokenMappings();

        await poolStub["stubAddMarket(address)"](wethCToken.address);
        await poolStub["stubRemoveMarket(address)"](usdcCToken.address);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(1, 1);
        expect(refreshTx).to.emit(accumulator, "CTokenAdded").withArgs(wethCToken.address);
        expect(refreshTx).to.emit(accumulator, "CTokenRemoved").withArgs(usdcCToken.address);
        expect(receipt.events.length).to.equal(3);

        const usdcTokenInfo = await accumulator.tokenInfo(USDC);
        expect(usdcTokenInfo.cToken).to.equal(ethers.constants.AddressZero);
        expect(usdcTokenInfo.underlyingDecimals).to.equal(0);

        const wethTokenInfo = await accumulator.tokenInfo(WETH);
        expect(wethTokenInfo.cToken).to.equal(wethCToken.address);
        expect(wethTokenInfo.underlyingDecimals).to.equal(18);
    });

    it("Works even if nothing changes", async function () {
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(0, 0);
        expect(receipt.events.length).to.equal(1);
    });

    it("CTokens without underlying tokens are treated as CEther", async function () {
        const cToken = await cTokenFactory.deploy(WETH);
        await cToken.deployed();

        await cToken.stubSetIsCEther(true);

        await poolStub["stubAddMarket(address)"](cToken.address);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(1, 0);
        expect(refreshTx).to.emit(accumulator, "CTokenAdded").withArgs(cToken.address);
        expect(receipt.events.length).to.equal(2);
    });

    it("Skips markets whose cToken is address(0)", async function () {
        const cToken = await cTokenFactory.deploy(WETH);
        await cToken.deployed();

        await poolStub["stubAddMarket(address)"](ethers.constants.AddressZero);
        const refreshTx = await accumulator.refreshTokenMappings();
        const receipt = await refreshTx.wait();

        expect(refreshTx).to.emit(accumulator, "TokenMappingsRefreshed").withArgs(0, 0);
        expect(receipt.events.length).to.equal(1);
    });
});

function createDescribeCompoundV2FetchLiquidityTests(typicalSupplyCalculation) {
    return function describeCompoundV2FetchLiquidityTests(contractName, deployContracts) {
        describe("Compound V2 special cases", function () {
            var poolStub;
            var accumulator;
            var decimals;
            var cTokenFactory;

            beforeEach(async function () {
                const contracts = await deployContracts(WETH, (decimals = DEFAULT_DECIMALS));
                poolStub = contracts.poolStub;
                accumulator = contracts.accumulator;
                cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
            });

            it("Reverts if the cToken is not a valid market", async function () {
                const updateData = ethers.utils.hexZeroPad(GRT, 32);
                await expect(accumulator.stubFetchLiquidity(updateData)).to.be.revertedWith("InvalidToken");
            });

            if (typicalSupplyCalculation) {
                const n = 1000;

                it("Fuzz testing with " + n + " iterations", async function () {
                    const token = WETH;
                    const updateData = ethers.utils.hexZeroPad(token, 32);

                    const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
                    const tokenDecimals = await tokenContract.decimals();

                    for (let i = 0; i < n; i++) {
                        // Generate a random number of supply, borrow, and reserves
                        const cash = getRandomBigNumber(64);
                        const borrow = getRandomBigNumber(64);
                        const reserves = getRandomBigNumber(64);

                        const totalSupply = cash.add(borrow).sub(reserves);

                        if (totalSupply.lt(0)) {
                            // Invalid total supply. Retry.
                            --i;

                            continue;
                        }

                        const rawCash = ethers.utils.parseUnits(cash.toString(), tokenDecimals - decimals);
                        const rawBorrow = ethers.utils.parseUnits(borrow.toString(), tokenDecimals - decimals);
                        const rawReserves = ethers.utils.parseUnits(reserves.toString(), tokenDecimals - decimals);

                        // Get the cToken
                        const cTokenAddress = await poolStub.cTokensByUnderlying(token);
                        const cToken = await cTokenFactory.attach(cTokenAddress);

                        await cToken.stubSetCash(rawCash);
                        await cToken.stubSetTotalBorrows(rawBorrow);
                        await cToken.stubSetTotalReserves(rawReserves);

                        const result = await accumulator.stubFetchLiquidity(updateData);

                        // Allow for a 0.00001% difference
                        expect(result.tokenLiquidity).to.be.closeTo(borrow, borrow.div(10000000));
                        expect(result.quoteTokenLiquidity).to.be.closeTo(totalSupply, totalSupply.div(10000000));
                    }
                });
            }
        });
    };
}

function createDescribeSpecificVenusIsolatedFetchLiquidityTests() {
    return function describeVenusIsolatedFetchLiquidityTests(contractName, deployContracts) {
        describe("Venus isolated special cases", function () {
            var poolStub;
            var accumulator;
            var decimals;
            var cTokenFactory;

            beforeEach(async function () {
                const contracts = await deployContracts(WETH, (decimals = DEFAULT_DECIMALS));
                poolStub = contracts.poolStub;
                accumulator = contracts.accumulator;
                cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
            });

            const n = 1000;

            it("Fuzz testing with " + n + " iterations", async function () {
                const token = WETH;
                const updateData = ethers.utils.hexZeroPad(token, 32);

                const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
                const tokenDecimals = await tokenContract.decimals();

                for (let i = 0; i < n; i++) {
                    // Generate a random number of supply, borrow, reserves, and bad debt
                    const cash = getRandomBigNumber(64);
                    const borrow = getRandomBigNumber(64);
                    const reserves = getRandomBigNumber(64);
                    const badDebt = getRandomBigNumber(64);

                    const totalSupply = cash.add(borrow).add(badDebt).sub(reserves);
                    const totalBorrow = borrow.add(badDebt);

                    if (totalSupply.lt(0)) {
                        // Invalid total supply. Retry.
                        --i;

                        continue;
                    }

                    const rawCash = ethers.utils.parseUnits(cash.toString(), tokenDecimals - decimals);
                    const rawBorrow = ethers.utils.parseUnits(borrow.toString(), tokenDecimals - decimals);
                    const rawReserves = ethers.utils.parseUnits(reserves.toString(), tokenDecimals - decimals);
                    const rawBadDebt = ethers.utils.parseUnits(badDebt.toString(), tokenDecimals - decimals);

                    // Get the cToken
                    const cTokenAddress = await poolStub.cTokensByUnderlying(token);
                    const cToken = await cTokenFactory.attach(cTokenAddress);

                    await cToken.stubSetCash(rawCash);
                    await cToken.stubSetTotalBorrows(rawBorrow);
                    await cToken.stubSetTotalReserves(rawReserves);
                    await cToken.stubSetBadDebt(rawBadDebt);

                    const result = await accumulator.stubFetchLiquidity(updateData);

                    // Allow for a 0.00001% difference
                    expect(result.tokenLiquidity).to.be.closeTo(totalBorrow, totalBorrow.div(10000000));
                    expect(result.quoteTokenLiquidity).to.be.closeTo(totalSupply, totalSupply.div(10000000));
                }
            });
        });
    };
}

function createDescribeIonicFetchLiquidityTests() {
    return createDescribeCompoundV2FetchLiquidityTests(false);
}

function createDescribeVenusIsolatedFetchLiquidityTests() {
    const stdDescribe = createDescribeCompoundV2FetchLiquidityTests(true);
    const venusIsolatedDescribe = createDescribeSpecificVenusIsolatedFetchLiquidityTests();

    return (contractName, deployContracts) => {
        stdDescribe(contractName, deployContracts);
        venusIsolatedDescribe(contractName, deployContracts);
    };
}

function describeSBAccumulatorTests(
    contractName,
    deployContracts,
    setSupply,
    setBorrow,
    tokensToTest,
    supportsBorrow = true,
    supportsStableBorrow = false,
    describeAdditionalTests = undefined
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

        if (describeAdditionalTests !== undefined) {
            describeAdditionalTests(contractName, deployContracts);
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

async function deployIonicContracts(baseToken, decimals) {
    const poolStubFactory = await ethers.getContractFactory("IonicStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("IonicSBAccumulatorStub");
    const cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");

    const poolStub = await poolStubFactory.deploy();
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

    const cToken = await cTokenFactory.deploy(baseToken);
    await cToken.deployed();

    await poolStub.stubSetCToken(baseToken, cToken.address);

    await accumulator.refreshTokenMappings();

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

async function deployVenusIsolatedContracts(baseToken, decimals) {
    const poolStubFactory = await ethers.getContractFactory("IonicStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("VenusIsolatedSBAccumulatorStub");
    const cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");

    const poolStub = await poolStubFactory.deploy();
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

    const cToken = await cTokenFactory.deploy(baseToken);
    await cToken.deployed();

    await poolStub.stubSetCToken(baseToken, cToken.address);

    await accumulator.refreshTokenMappings();

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

async function deployCompoundV2Contracts(baseToken, decimals) {
    const poolStubFactory = await ethers.getContractFactory("IonicStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("CompoundV2SBAccumulatorStub");
    const cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");

    const poolStub = await poolStubFactory.deploy();
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

    const cToken = await cTokenFactory.deploy(baseToken);
    await cToken.deployed();

    await poolStub.stubSetCToken(baseToken, cToken.address);

    await accumulator.refreshTokenMappings();

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

async function ionicSetSupply(stub, token, amount, decimals) {
    const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
    const cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
    const tokenDecimals = await tokenContract.decimals();

    const rawAmount = ethers.utils.parseUnits(amount.toString(), tokenDecimals - decimals);

    const cTokenAddress = await stub.cTokensByUnderlying(token);
    const cToken = await cTokenFactory.attach(cTokenAddress);

    await cToken.stubSetTotalUnderlyingSupplied(rawAmount);
    await cToken.stubSetCash(rawAmount);
}

async function ionicSetBorrow(stub, token, amount, decimals) {
    const tokenContract = await ethers.getContractAt("IERC20Metadata", token);
    const cTokenFactory = await ethers.getContractFactory("IonicCTokenStub");
    const tokenDecimals = await tokenContract.decimals();

    const rawAmount = ethers.utils.parseUnits(amount.toString(), tokenDecimals - decimals);

    const cTokenAddress = await stub.cTokensByUnderlying(token);
    const cToken = await cTokenFactory.attach(cTokenAddress);

    await cToken.stubSetTotalBorrows(rawAmount);

    // We set total reverses as the same negate the amount from the total supply
    await cToken.stubSetTotalReserves(rawAmount);
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
describeSBAccumulatorTests(
    "IonicSBAccumulator",
    deployIonicContracts,
    ionicSetSupply,
    ionicSetBorrow,
    [_WETH, _USDC],
    true,
    false,
    createDescribeIonicFetchLiquidityTests()
);
describeSBAccumulatorTests(
    "CompoundV2SBAccumulator",
    deployCompoundV2Contracts,
    ionicSetSupply,
    ionicSetBorrow,
    [_WETH, _USDC],
    true,
    false,
    createDescribeCompoundV2FetchLiquidityTests(true)
);
describeSBAccumulatorTests(
    "VenusIsolatedSBAccumulator",
    deployVenusIsolatedContracts,
    ionicSetSupply,
    ionicSetBorrow,
    [_WETH, _USDC],
    true,
    false,
    createDescribeVenusIsolatedFetchLiquidityTests()
);
