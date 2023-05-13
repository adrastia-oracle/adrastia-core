const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const SUPPLY_RATE_TYPE = 16;
const BORROW_RATE_TYPE = 17;
const STABLE_BORROW_RATE_TYPE = 18;

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60; // At most (optimistically) 60 seconds between every update

const DEFAULT_UTILIZATION = ethers.utils.parseUnits("0.89", 18);
const DEFAULT_SUPPLY_RATE = ethers.utils.parseUnits("0.05", 18);
const DEFAULT_BORROW_RATE = ethers.utils.parseUnits("0.1", 18);
const DEFAULT_STABLE_BORROW_RATE = ethers.utils.parseUnits("0.15", 18);

const SECONDS_PER_YEAR = BigNumber.from(365 * 24 * 60 * 60);
const BLOCKS_PER_YEAR = SECONDS_PER_YEAR.div(12); // 12 seconds per block

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function decimalToEthereumAddress(decimalNumber) {
    // Convert the decimal number to a hexadecimal string
    const hexString = decimalNumber.toString(16);

    // Pad the hexadecimal string with leading zeros to get 40 characters
    const paddedHexString = hexString.padStart(40, "0");

    // Add the '0x' prefix to get the Ethereum address
    const ethereumAddress = ethers.utils.getAddress("0x" + paddedHexString);

    return ethereumAddress;
}

describe("CometRateAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("CometStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("CometRateAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy(
            USDC,
            DEFAULT_UTILIZATION,
            DEFAULT_SUPPLY_RATE,
            DEFAULT_BORROW_RATE
        );
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        const accumulator = await accumulatorFactory.deploy(
            averagingStrategy.address,
            poolStub.address,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.comet()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenAddress()).to.equal(USDC);
    });
});

describe("CompoundV2RateAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("CTokenStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("CompoundV2RateAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy(DEFAULT_SUPPLY_RATE, DEFAULT_BORROW_RATE);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        const accumulator = await accumulatorFactory.deploy(
            averagingStrategy.address,
            BLOCKS_PER_YEAR,
            poolStub.address,
            USDC,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.blocksPerYear()).to.equal(BLOCKS_PER_YEAR);
        expect(await accumulator.cToken()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenAddress()).to.equal(USDC);
    });

    it("Reverts if blocks per year is 0", async function () {
        const poolStub = await poolStubFactory.deploy(DEFAULT_SUPPLY_RATE, DEFAULT_BORROW_RATE);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        await expect(
            accumulatorFactory.deploy(
                averagingStrategy.address,
                0,
                poolStub.address,
                USDC,
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY,
                DEFAULT_HEARTBEAT
            )
        ).to.be.revertedWith("InvalidBlocksPerYear");
    });

    it("Reverts if blocks per year is too high", async function () {
        const poolStub = await poolStubFactory.deploy(DEFAULT_SUPPLY_RATE, DEFAULT_BORROW_RATE);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        await expect(
            accumulatorFactory.deploy(
                averagingStrategy.address,
                ethers.constants.MaxUint256,
                poolStub.address,
                USDC,
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY,
                DEFAULT_HEARTBEAT
            )
        ).to.be.revertedWith("InvalidBlocksPerYear");
    });
});

describe("AaveV2RateAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("AaveV2PoolStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("AaveV2RateAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy(
            DEFAULT_SUPPLY_RATE,
            DEFAULT_BORROW_RATE,
            DEFAULT_STABLE_BORROW_RATE
        );
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        const accumulator = await accumulatorFactory.deploy(
            averagingStrategy.address,
            poolStub.address,
            USDC,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.aaveV2Pool()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenAddress()).to.equal(USDC);
    });
});

describe("AaveV3RateAccumulator#constructor", function () {
    var poolStubFactory;
    var averagingStrategyFactory;
    var accumulatorFactory;

    beforeEach(async function () {
        poolStubFactory = await ethers.getContractFactory("AaveV3PoolStub");
        averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
        accumulatorFactory = await ethers.getContractFactory("AaveV3RateAccumulator");
    });

    it("Works", async function () {
        const poolStub = await poolStubFactory.deploy(
            DEFAULT_SUPPLY_RATE,
            DEFAULT_BORROW_RATE,
            DEFAULT_STABLE_BORROW_RATE
        );
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await poolStub.deployed();

        const accumulator = await accumulatorFactory.deploy(
            averagingStrategy.address,
            poolStub.address,
            USDC,
            DEFAULT_UPDATE_THRESHOLD,
            DEFAULT_UPDATE_DELAY,
            DEFAULT_HEARTBEAT
        );

        expect(await accumulator.averagingStrategy()).to.equal(averagingStrategy.address);
        expect(await accumulator.aaveV3Pool()).to.equal(poolStub.address);
        expect(await accumulator.updateThreshold()).to.equal(DEFAULT_UPDATE_THRESHOLD);
        expect(await accumulator.updateDelay()).to.equal(DEFAULT_UPDATE_DELAY);
        expect(await accumulator.heartbeat()).to.equal(DEFAULT_HEARTBEAT);
        expect(await accumulator.quoteTokenAddress()).to.equal(USDC);
    });
});

function describeRateAccumulatorTests(
    contractName,
    deployContracts,
    convertYearlyRateToInternalRate,
    supportsStableBorrowRate = false
) {
    const ratesToTest = [
        BigNumber.from(0),
        ethers.utils.parseUnits("0.0001", 18), // 0.01%
        ethers.utils.parseUnits("0.01", 18), // 1%
        ethers.utils.parseUnits("0.5", 18), // 50%
        ethers.utils.parseUnits("1", 18), // 100%
        ethers.utils.parseUnits("100", 18), // 10000%
    ];

    describe(contractName + "#fetchPrice", function () {
        var poolStub;
        var accumulator;

        beforeEach(async function () {
            const contracts = await deployContracts();
            poolStub = contracts.poolStub;
            accumulator = contracts.accumulator;
        });

        describe("Supply rates", function () {
            for (const rateToTest of ratesToTest) {
                it("Works for supply rate " + ethers.utils.formatUnits(rateToTest, 16) + "%", async function () {
                    const internalRate = convertYearlyRateToInternalRate(rateToTest);
                    await poolStub.setSupplyRate(internalRate);

                    // Encode the rate type as bytes
                    const rateTypeBytes = ethers.utils.hexZeroPad(BigNumber.from(SUPPLY_RATE_TYPE).toHexString(), 32);
                    // Fetch the rate
                    const result = await accumulator.stubFetchPrice(rateTypeBytes);

                    // Allow for a 0.00001% difference
                    expect(result).to.be.closeTo(rateToTest, rateToTest.div(10000000));
                });
            }
        });

        describe("Borrow rates", function () {
            for (const rateToTest of ratesToTest) {
                it("Works for borrow rate " + ethers.utils.formatUnits(rateToTest, 16) + "%", async function () {
                    const internalRate = convertYearlyRateToInternalRate(rateToTest);
                    await poolStub.setBorrowRate(internalRate);

                    // Encode the rate type as bytes
                    const rateTypeBytes = ethers.utils.hexZeroPad(BigNumber.from(BORROW_RATE_TYPE).toHexString(), 32);
                    // Fetch the rate
                    const result = await accumulator.stubFetchPrice(rateTypeBytes);

                    // Allow for a 0.00001% difference
                    expect(result).to.be.closeTo(rateToTest, rateToTest.div(10000000));
                });
            }
        });

        if (supportsStableBorrowRate) {
            describe("Stable borrow rates", function () {
                for (const rateToTest of ratesToTest) {
                    it(
                        "Works for stable borrow rate " + ethers.utils.formatUnits(rateToTest, 16) + "%",
                        async function () {
                            const internalRate = convertYearlyRateToInternalRate(rateToTest);
                            await poolStub.setStableBorrowRate(internalRate);

                            // Encode the rate type as bytes
                            const rateTypeBytes = ethers.utils.hexZeroPad(
                                BigNumber.from(STABLE_BORROW_RATE_TYPE).toHexString(),
                                32
                            );
                            // Fetch the rate
                            const result = await accumulator.stubFetchPrice(rateTypeBytes);

                            // Allow for a 0.00001% difference
                            expect(result).to.be.closeTo(rateToTest, rateToTest.div(10000000));
                        }
                    );
                }
            });
        }

        it("Reverts for unknown rate type", async function () {
            // Encode the rate type as bytes
            const rateTypeBytes = ethers.utils.hexZeroPad(BigNumber.from(3).toHexString(), 32);
            // Fetch the rate
            await expect(accumulator.stubFetchPrice(rateTypeBytes)).to.be.revertedWith("InvalidRateType");
        });
    });

    describe(contractName + "#update", function () {
        var poolStub;
        var accumulator;

        beforeEach(async function () {
            const contracts = await deployContracts();
            poolStub = contracts.poolStub;
            accumulator = contracts.accumulator;
        });

        describe("Supply rates", function () {
            for (const rateToTest of ratesToTest) {
                it("Works for supply rate " + ethers.utils.formatUnits(rateToTest, 16) + "%", async function () {
                    const internalRate = convertYearlyRateToInternalRate(rateToTest);
                    await poolStub.setSupplyRate(internalRate);

                    const currentTime = await currentBlockTimestamp();

                    // Convert the rate type to an address
                    const rateTypeAddress = decimalToEthereumAddress(SUPPLY_RATE_TYPE);

                    // Encode the rate type, internal rate, and timestamp as bytes
                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint256", "uint256"],
                        [rateTypeAddress, rateToTest, currentTime]
                    );

                    // Ensure that the last update time is 0
                    expect(await accumulator.lastUpdateTime(updateData)).to.equal(0);

                    // Expect update to return true
                    expect(await accumulator.callStatic.update(updateData)).to.equal(true);
                    // Update
                    const tx = await accumulator.update(updateData);
                    const receipt = await tx.wait();

                    // Expect the event to be emitted
                    await expect(tx).to.emit(accumulator, "Updated");
                    // Find the Updated event object
                    const updatedEvent = receipt.events.find((e) => e.event == "Updated");
                    // Expect the reported token to be correct
                    expect(updatedEvent.args["token"]).to.equal(rateTypeAddress);
                    // Expect the reported price to be correct within 0.00001% accuracy
                    expect(updatedEvent.args["price"]).to.be.closeTo(rateToTest, rateToTest.div(10000000));
                    // Expect that the timestamp is correct
                    expect(updatedEvent.args["timestamp"]).to.equal(await blockTimestamp(receipt.blockNumber));
                });
            }
        });

        describe("Borrow rates", function () {
            for (const rateToTest of ratesToTest) {
                it("Works for borrow rate " + ethers.utils.formatUnits(rateToTest, 16) + "%", async function () {
                    const internalRate = convertYearlyRateToInternalRate(rateToTest);
                    await poolStub.setBorrowRate(internalRate);

                    const currentTime = await currentBlockTimestamp();

                    // Convert the rate type to an address
                    const rateTypeAddress = decimalToEthereumAddress(BORROW_RATE_TYPE);

                    // Encode the rate type, internal rate, and timestamp as bytes
                    const updateData = ethers.utils.defaultAbiCoder.encode(
                        ["address", "uint256", "uint256"],
                        [rateTypeAddress, rateToTest, currentTime]
                    );

                    // Ensure that the last update time is 0
                    expect(await accumulator.lastUpdateTime(updateData)).to.equal(0);

                    // Expect update to return true
                    expect(await accumulator.callStatic.update(updateData)).to.equal(true);
                    // Update
                    const tx = await accumulator.update(updateData);
                    const receipt = await tx.wait();

                    // Expect the event to be emitted
                    await expect(tx).to.emit(accumulator, "Updated");
                    // Find the Updated event object
                    const updatedEvent = receipt.events.find((e) => e.event == "Updated");
                    // Expect the reported token to be correct
                    expect(updatedEvent.args["token"]).to.equal(rateTypeAddress);
                    // Expect the reported price to be correct within 0.00001% accuracy
                    expect(updatedEvent.args["price"]).to.be.closeTo(rateToTest, rateToTest.div(10000000));
                    // Expect that the timestamp is correct
                    expect(updatedEvent.args["timestamp"]).to.equal(await blockTimestamp(receipt.blockNumber));
                });
            }
        });

        if (supportsStableBorrowRate) {
            describe("Stable borrow rates", function () {
                for (const rateToTest of ratesToTest) {
                    it(
                        "Works for stable borrow rate " + ethers.utils.formatUnits(rateToTest, 16) + "%",
                        async function () {
                            const internalRate = convertYearlyRateToInternalRate(rateToTest);
                            await poolStub.setStableBorrowRate(internalRate);

                            const currentTime = await currentBlockTimestamp();

                            // Convert the rate type to an address
                            const rateTypeAddress = decimalToEthereumAddress(STABLE_BORROW_RATE_TYPE);

                            // Encode the rate type, internal rate, and timestamp as bytes
                            const updateData = ethers.utils.defaultAbiCoder.encode(
                                ["address", "uint256", "uint256"],
                                [rateTypeAddress, rateToTest, currentTime]
                            );

                            // Ensure that the last update time is 0
                            expect(await accumulator.lastUpdateTime(updateData)).to.equal(0);

                            // Expect update to return true
                            expect(await accumulator.callStatic.update(updateData)).to.equal(true);
                            // Update
                            const tx = await accumulator.update(updateData);
                            const receipt = await tx.wait();

                            // Expect the event to be emitted
                            await expect(tx).to.emit(accumulator, "Updated");
                            // Find the Updated event object
                            const updatedEvent = receipt.events.find((e) => e.event == "Updated");
                            // Expect the reported token to be correct
                            expect(updatedEvent.args["token"]).to.equal(rateTypeAddress);
                            // Expect the reported price to be correct within 0.00001% accuracy
                            expect(updatedEvent.args["price"]).to.be.closeTo(rateToTest, rateToTest.div(10000000));
                            // Expect that the timestamp is correct
                            expect(updatedEvent.args["timestamp"]).to.equal(await blockTimestamp(receipt.blockNumber));
                        }
                    );
                }
            });
        }
    });
}

async function deployCometContracts() {
    const poolStubFactory = await ethers.getContractFactory("CometStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("CometRateAccumulatorStub");

    const poolStub = await poolStubFactory.deploy(USDC, DEFAULT_UTILIZATION, DEFAULT_SUPPLY_RATE, DEFAULT_BORROW_RATE);
    await poolStub.deployed();

    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const accumulator = await accumulatorFactory.deploy(
        averagingStrategy.address,
        poolStub.address,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

async function deployCompoundV2Contracts() {
    const poolStubFactory = await ethers.getContractFactory("CTokenStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("CompoundV2RateAccumulatorStub");

    const poolStub = await poolStubFactory.deploy(DEFAULT_SUPPLY_RATE, DEFAULT_BORROW_RATE);
    await poolStub.deployed();

    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const accumulator = await accumulatorFactory.deploy(
        averagingStrategy.address,
        BLOCKS_PER_YEAR,
        poolStub.address,
        USDC,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

async function deployAaveV2Contracts() {
    const poolStubFactory = await ethers.getContractFactory("AaveV2PoolStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("AaveV2RateAccumulatorStub");

    const poolStub = await poolStubFactory.deploy(DEFAULT_SUPPLY_RATE, DEFAULT_BORROW_RATE, DEFAULT_STABLE_BORROW_RATE);
    await poolStub.deployed();

    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const accumulator = await accumulatorFactory.deploy(
        averagingStrategy.address,
        poolStub.address,
        USDC,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

async function deployAaveV3Contracts() {
    const poolStubFactory = await ethers.getContractFactory("AaveV3PoolStub");
    const averagingStrategyFactory = await ethers.getContractFactory("ArithmeticAveraging");
    const accumulatorFactory = await ethers.getContractFactory("AaveV3RateAccumulatorStub");

    const poolStub = await poolStubFactory.deploy(DEFAULT_SUPPLY_RATE, DEFAULT_BORROW_RATE, DEFAULT_STABLE_BORROW_RATE);
    await poolStub.deployed();

    const averagingStrategy = await averagingStrategyFactory.deploy();
    await averagingStrategy.deployed();

    const accumulator = await accumulatorFactory.deploy(
        averagingStrategy.address,
        poolStub.address,
        USDC,
        DEFAULT_UPDATE_THRESHOLD,
        DEFAULT_UPDATE_DELAY,
        DEFAULT_HEARTBEAT
    );

    return {
        poolStub: poolStub,
        accumulator: accumulator,
    };
}

function cometYearlyRateToInternalRate(rate) {
    return rate.div(SECONDS_PER_YEAR);
}

function compoundV2YearlyRateToInternalRate(rate) {
    return rate.div(BLOCKS_PER_YEAR);
}

function aaveYearlyRateToInternalRate(rate) {
    return rate.mul(BigNumber.from(10).pow(9)); // Convert to ray
}

describeRateAccumulatorTests("CometRateAccumulator", deployCometContracts, cometYearlyRateToInternalRate);
describeRateAccumulatorTests(
    "CompoundV2RateAccumulator",
    deployCompoundV2Contracts,
    compoundV2YearlyRateToInternalRate
);
describeRateAccumulatorTests("AaveV2RateAccumulator", deployAaveV2Contracts, aaveYearlyRateToInternalRate, true);
describeRateAccumulatorTests("AaveV3RateAccumulator", deployAaveV3Contracts, aaveYearlyRateToInternalRate, true);
