const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;

const ONE = BigNumber.from(1);
const TWO = BigNumber.from(2);

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const BAT = "0x0D8775F648430679A709E98d2b0Cb6250d2887EF";

const DEFAULT_FILTER_AMOUNT = 3;
const DEFAULT_FILTER_OFFSET = 0;
const DEFAULT_FILTER_INCREMENT = 1;

const DEFAULT_VOLATILITY_PRECISION_DECIMALS = 8;
const DEFAULT_VOLATILITY_MEAN_TYPE = 1; // arithmetic mean

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function sqrt(value) {
    x = BigNumber.from(value);
    let z = x.add(ONE).div(TWO);
    let y = x;
    while (z.sub(y).isNegative()) {
        y = z;
        z = x.div(z).add(z).div(TWO);
    }
    return y;
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

async function deployMedianFilteringOracle(underlyingOracle = undefined) {
    const oracleFactory = await ethers.getContractFactory("MedianFilteringOracleStub");

    if (underlyingOracle === undefined) {
        const historicalOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");

        underlyingOracle = await historicalOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();
    }

    await underlyingOracle.setObservationsCapacity(GRT, 100);

    const oracle = await oracleFactory.deploy(
        underlyingOracle.address,
        DEFAULT_FILTER_AMOUNT,
        DEFAULT_FILTER_OFFSET,
        DEFAULT_FILTER_INCREMENT
    );
    await oracle.deployed();

    return {
        oracle: oracle,
        underlyingOracle: underlyingOracle,
    };
}

async function deployPriceVolatilityOracle(underlyingOracle = undefined) {
    const oracleFactory = await ethers.getContractFactory("PriceVolatilityOracleStub");

    if (underlyingOracle === undefined) {
        const historicalOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");

        underlyingOracle = await historicalOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();
    }

    await underlyingOracle.setObservationsCapacity(GRT, 100);

    const volatilityViewFactory = await ethers.getContractFactory("VolatilityOracleView");
    const volatilityView = await volatilityViewFactory.deploy(DEFAULT_VOLATILITY_PRECISION_DECIMALS);
    await volatilityView.deployed();

    const oracle = await oracleFactory.deploy(
        volatilityView.address,
        underlyingOracle.address,
        DEFAULT_FILTER_AMOUNT,
        DEFAULT_FILTER_OFFSET,
        DEFAULT_FILTER_INCREMENT,
        DEFAULT_VOLATILITY_MEAN_TYPE
    );
    await oracle.deployed();

    return {
        oracle: oracle,
        underlyingOracle: underlyingOracle,
        volatilityView: volatilityView,
    };
}

describe("MedianFilteringOracle#constructor", async function () {
    var underlyingOracle;
    var oracleFactory;

    beforeEach(async function () {
        const historicalOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
        oracleFactory = await ethers.getContractFactory("MedianFilteringOracleStub");

        underlyingOracle = await historicalOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();
    });

    it("Deploys correctly with valid parameters", async function () {
        const oracle = await oracleFactory.deploy(
            underlyingOracle.address,
            DEFAULT_FILTER_AMOUNT,
            DEFAULT_FILTER_OFFSET,
            DEFAULT_FILTER_INCREMENT
        );

        expect(await oracle.source()).to.equal(underlyingOracle.address);
        expect(await oracle.observationAmount()).to.equal(DEFAULT_FILTER_AMOUNT);
        expect(await oracle.observationOffset()).to.equal(DEFAULT_FILTER_OFFSET);
        expect(await oracle.observationIncrement()).to.equal(DEFAULT_FILTER_INCREMENT);
    });

    it("Reverts if observationAmount is 0", async function () {
        await expect(
            oracleFactory.deploy(underlyingOracle.address, 0, DEFAULT_FILTER_OFFSET, DEFAULT_FILTER_INCREMENT)
        ).to.be.revertedWith("InvalidAmount");
    });

    it("Reverts if observationIncrement is 0", async function () {
        await expect(
            oracleFactory.deploy(underlyingOracle.address, DEFAULT_FILTER_AMOUNT, DEFAULT_FILTER_OFFSET, 0)
        ).to.be.revertedWith("InvalidIncrement");
    });
});

describe("PriceVolatilityOracle#constructor", async function () {
    var underlyingOracle;
    var volatilityView;
    var oracleFactory;

    beforeEach(async function () {
        const historicalOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
        oracleFactory = await ethers.getContractFactory("PriceVolatilityOracleStub");

        underlyingOracle = await historicalOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const volatilityViewFactory = await ethers.getContractFactory("VolatilityOracleView");
        volatilityView = await volatilityViewFactory.deploy(DEFAULT_VOLATILITY_PRECISION_DECIMALS);
        await volatilityView.deployed();
    });

    it("Deploys correctly with valid parameters", async function () {
        const oracle = await oracleFactory.deploy(
            volatilityView.address,
            underlyingOracle.address,
            DEFAULT_FILTER_AMOUNT,
            DEFAULT_FILTER_OFFSET,
            DEFAULT_FILTER_INCREMENT,
            DEFAULT_VOLATILITY_MEAN_TYPE
        );

        expect(await oracle.source()).to.equal(underlyingOracle.address);
        expect(await oracle.observationAmount()).to.equal(DEFAULT_FILTER_AMOUNT);
        expect(await oracle.observationOffset()).to.equal(DEFAULT_FILTER_OFFSET);
        expect(await oracle.observationIncrement()).to.equal(DEFAULT_FILTER_INCREMENT);

        expect(await oracle.volatilityView()).to.equal(volatilityView.address);
        expect(await oracle.meanType()).to.equal(DEFAULT_VOLATILITY_MEAN_TYPE);
    });

    it("Reverts if observationAmount is 0", async function () {
        await expect(
            oracleFactory.deploy(
                volatilityView.address,
                underlyingOracle.address,
                0,
                DEFAULT_FILTER_OFFSET,
                DEFAULT_FILTER_INCREMENT,
                DEFAULT_VOLATILITY_MEAN_TYPE
            )
        ).to.be.revertedWith("InvalidAmount");
    });

    it("Reverts if observationIncrement is 0", async function () {
        await expect(
            oracleFactory.deploy(
                volatilityView.address,
                underlyingOracle.address,
                DEFAULT_FILTER_AMOUNT,
                DEFAULT_FILTER_OFFSET,
                0,
                DEFAULT_VOLATILITY_MEAN_TYPE
            )
        ).to.be.revertedWith("InvalidIncrement");
    });

    it("Reverts if volatilityView is the zero address", async function () {
        await expect(
            oracleFactory.deploy(
                ethers.constants.AddressZero,
                underlyingOracle.address,
                DEFAULT_FILTER_AMOUNT,
                DEFAULT_FILTER_OFFSET,
                DEFAULT_FILTER_INCREMENT,
                DEFAULT_VOLATILITY_MEAN_TYPE
            )
        ).to.be.revertedWith("InvalidVolatilityView");
    });
});

function describeHistoricalAggregatorOracleTests(
    contractName,
    deployFunc,
    computeObservation,
    observationsRequiredForAmount,
    amountsToTest
) {
    describe(contractName + "#needsUpdate", async function () {
        var oracle;
        var underlyingOracle;

        var updateData;

        beforeEach(async function () {
            const deployment = await deployFunc();
            oracle = deployment.oracle;
            underlyingOracle = deployment.underlyingOracle;

            updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        });

        it("Doesn't need an update if the underlying oracle doesn't have an observation", async function () {
            expect(await oracle.needsUpdate(updateData)).to.equal(false);
        });

        it("Doesn't need an update if the underlying oracle has less than the required amount of observations (1 observation)", async function () {
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);

            expect(await oracle.needsUpdate(updateData)).to.equal(false);
        });

        it("Doesn't need an update if the underlying oracle has less than the required amount of observations (2 observations)", async function () {
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);

            expect(await oracle.needsUpdate(updateData)).to.equal(false);
        });

        it("Doesn't need an update if the underlying oracle has less than the required amount of observations (3 observations but offset is 1)", async function () {
            const historicalOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
            const oracleFactory = await ethers.getContractFactory("MedianFilteringOracle");

            const underlyingOracle2 = await historicalOracleFactory.deploy(USDC);
            await underlyingOracle2.deployed();

            await underlyingOracle2.setObservationsCapacity(GRT, DEFAULT_FILTER_AMOUNT + 1);

            const oracle2 = await oracleFactory.deploy(
                underlyingOracle2.address,
                DEFAULT_FILTER_AMOUNT,
                1,
                DEFAULT_FILTER_INCREMENT
            );

            await underlyingOracle2.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle2.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle2.stubPushNow(GRT, 2, 3, 5);

            expect(await oracle2.needsUpdate(updateData)).to.equal(false);
        });

        it("Doesn't need an update if the underlying oracle has less than the required amount of observations (3 observations but increment is 2)", async function () {
            const historicalOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
            const oracleFactory = await ethers.getContractFactory("MedianFilteringOracle");

            const underlyingOracle2 = await historicalOracleFactory.deploy(USDC);
            await underlyingOracle2.deployed();

            await underlyingOracle2.setObservationsCapacity(GRT, DEFAULT_FILTER_AMOUNT + 1);

            const oracle2 = await oracleFactory.deploy(
                underlyingOracle2.address,
                DEFAULT_FILTER_AMOUNT,
                DEFAULT_FILTER_OFFSET,
                2
            );

            await underlyingOracle2.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle2.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle2.stubPushNow(GRT, 2, 3, 5);

            expect(await oracle2.needsUpdate(updateData)).to.equal(false);
        });

        it("Doesn't need an update if the latest observation timestamp matches the latest observation timestamp of the underlying oracle", async function () {
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);

            const latestObservationTimestamp = await underlyingOracle.lastUpdateTime(updateData);

            // Sanity check that we need an update before we push an observation
            expect(await oracle.needsUpdate(updateData)).to.equal(true);

            await oracle.stubPush(GRT, 2, 3, 5, latestObservationTimestamp);

            expect(await oracle.needsUpdate(updateData)).to.equal(false);
        });

        it("Doesn't need an update if the latest observation timestamp is after the latest observation timestamp of the underlying oracle", async function () {
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);

            const latestObservationTimestamp = await underlyingOracle.lastUpdateTime(updateData);

            // Sanity check that we need an update before we push an observation
            expect(await oracle.needsUpdate(updateData)).to.equal(true);

            await oracle.stubPush(GRT, 2, 3, 5, latestObservationTimestamp.add(1));

            expect(await oracle.needsUpdate(updateData)).to.equal(false);
        });

        it("Needs an update if the latest observation timestamp is before the latest observation timestamp of the underlying oracle", async function () {
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);

            const latestObservationTimestamp = await underlyingOracle.lastUpdateTime(updateData);

            // Sanity check that we need an update before we push an observation
            expect(await oracle.needsUpdate(updateData)).to.equal(true);

            await oracle.stubPush(GRT, 2, 3, 5, latestObservationTimestamp.sub(1));

            expect(await oracle.needsUpdate(updateData)).to.equal(true);
        });

        it("Needs an update if the underlying oracle has the required amount of observations", async function () {
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            await underlyingOracle.stubPushNow(GRT, 2, 3, 5);

            expect(await oracle.needsUpdate(updateData)).to.equal(true);
        });

        it("Doesn't need an update after an update has been pushed", async function () {
            const timestamp1 = 1000;
            const timestamp2 = 2000;
            const timestamp3 = 3000;

            await underlyingOracle.stubPush(GRT, 2, 3, 5, timestamp1);
            await underlyingOracle.stubPush(GRT, 2, 3, 5, timestamp2);
            await underlyingOracle.stubPush(GRT, 2, 3, 5, timestamp3);

            // Sanity check that the oracle needs an update
            expect(await oracle.needsUpdate(updateData)).to.equal(true);

            await oracle.stubPush(GRT, 2, 3, 5, timestamp3);

            expect(await oracle.needsUpdate(updateData)).to.equal(false);
        });

        it("Doesn't need an update after an update has been pushed (with an offset of 1)", async function () {
            await oracle.stubOverrideFilterOffset(true, 1);

            const timestamp1 = 1000;
            const timestamp2 = 2000;
            const timestamp3 = 3000;
            const timestamp4 = 4000;

            await underlyingOracle.stubPush(GRT, 2, 3, 5, timestamp1);
            await underlyingOracle.stubPush(GRT, 2, 3, 5, timestamp2);
            await underlyingOracle.stubPush(GRT, 2, 3, 5, timestamp3);
            await underlyingOracle.stubPush(GRT, 2, 3, 5, timestamp4);

            // Sanity check that the oracle needs an update
            expect(await oracle.needsUpdate(updateData)).to.equal(true);

            await oracle.stubPush(GRT, 2, 3, 5, timestamp3); // Offset of 1

            expect(await oracle.needsUpdate(updateData)).to.equal(false);
        });
    });

    describe(contractName + "#canUpdate", async function () {
        var oracle;
        var underlyingOracle;

        var updateData;

        beforeEach(async function () {
            const deployment = await deployFunc();
            oracle = deployment.oracle;
            underlyingOracle = deployment.underlyingOracle;

            updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        });

        it("Can update if needsUpdate returns true", async function () {
            await oracle.stubOverrideNeedsUpdate(true, true);

            expect(await oracle.canUpdate(updateData)).to.equal(true);
        });

        it("Can't update if needsUpdate returns false", async function () {
            await oracle.stubOverrideNeedsUpdate(true, false);

            expect(await oracle.canUpdate(updateData)).to.equal(false);
        });
    });

    describe(contractName + "#liquidityDecimals", function () {
        var underlyingOracleFactory;

        beforeEach(async function () {
            oracleFactory = await ethers.getContractFactory("MedianFilteringOracleStub");
            underlyingOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
        });

        it("Returns the liquidity decimals of the underlying oracle (= 18)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(USDC);
            await underlyingOracle.deployed();

            const liquidityDecimals = 18;

            await underlyingOracle.stubSetLiquidityDecimals(liquidityDecimals);

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.liquidityDecimals()).to.equal(liquidityDecimals);
        });

        it("Returns the liquidity decimals of the underlying oracle (= 0)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(USDC);
            await underlyingOracle.deployed();

            const liquidityDecimals = 0;

            await underlyingOracle.stubSetLiquidityDecimals(liquidityDecimals);

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.liquidityDecimals()).to.equal(liquidityDecimals);
        });

        it("Returns the liquidity decimals of the underlying oracle (= 6)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(USDC);
            await underlyingOracle.deployed();

            const liquidityDecimals = 6;

            await underlyingOracle.stubSetLiquidityDecimals(liquidityDecimals);

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.liquidityDecimals()).to.equal(liquidityDecimals);
        });
    });

    describe(contractName + "#quoteTokenDecimals", function () {
        var underlyingOracleFactory;

        beforeEach(async function () {
            underlyingOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
        });

        it("Returns the quote token decimals of the underlying oracle (= USDC)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(USDC);
            await underlyingOracle.deployed();

            const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenDecimals()).to.equal(quoteTokenDecimals);
        });

        it("Returns the quote token decimals of the underlying oracle (= GRT)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(GRT);
            await underlyingOracle.deployed();

            const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenDecimals()).to.equal(quoteTokenDecimals);
        });
    });

    describe(contractName + "#quoteTokenAddress", function () {
        var underlyingOracleFactory;

        beforeEach(async function () {
            underlyingOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
        });

        it("Returns the quote token address of the underlying oracle (= USDC)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(USDC);
            await underlyingOracle.deployed();

            const quoteTokenAddress = await underlyingOracle.quoteTokenAddress();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenAddress()).to.equal(quoteTokenAddress);
        });

        it("Returns the quote token address of the underlying oracle (= GRT)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(GRT);
            await underlyingOracle.deployed();

            const quoteTokenAddress = await underlyingOracle.quoteTokenAddress();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenAddress()).to.equal(quoteTokenAddress);
        });
    });

    describe(contractName + "#quoteTokenName", function () {
        var underlyingOracleFactory;

        beforeEach(async function () {
            oracleFactory = await ethers.getContractFactory("MedianFilteringOracleStub");
            underlyingOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
        });

        it("Returns the quote token name of the underlying oracle (= USDC)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(USDC);
            await underlyingOracle.deployed();

            const quoteTokenName = await underlyingOracle.quoteTokenName();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenName()).to.equal(quoteTokenName);
        });

        it("Returns the quote token name of the underlying oracle (= GRT)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(GRT);
            await underlyingOracle.deployed();

            const quoteTokenName = await underlyingOracle.quoteTokenName();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenName()).to.equal(quoteTokenName);
        });
    });

    describe(contractName + "#quoteTokenSymbol", function () {
        var underlyingOracleFactory;

        beforeEach(async function () {
            underlyingOracleFactory = await ethers.getContractFactory("HistoricalOracleStub");
        });

        it("Returns the quote token symbol of the underlying oracle (= USDC)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(USDC);
            await underlyingOracle.deployed();

            const quoteTokenSymbol = await underlyingOracle.quoteTokenSymbol();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenSymbol()).to.equal(quoteTokenSymbol);
        });

        it("Returns the quote token symbol of the underlying oracle (= GRT)", async function () {
            const underlyingOracle = await underlyingOracleFactory.deploy(GRT);
            await underlyingOracle.deployed();

            const quoteTokenSymbol = await underlyingOracle.quoteTokenSymbol();

            const oracle = (await deployFunc(underlyingOracle)).oracle;

            expect(await oracle.quoteTokenSymbol()).to.equal(quoteTokenSymbol);
        });
    });

    describe(contractName + "#update", function () {
        var oracle;
        var underlyingOracle;

        var updateData;

        const nFuzz = 10;

        beforeEach(async function () {
            const deployment = await deployFunc();
            oracle = deployment.oracle;
            underlyingOracle = deployment.underlyingOracle;

            updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        });

        async function testVariousObservations(amount) {
            var observations = [];

            const amountToPush = observationsRequiredForAmount(amount);

            // Push observations to the underlying oracle
            for (var i = 0; i < amountToPush; i++) {
                const price = getRandomBigNumber(112);
                const tokenLiquidity = getRandomBigNumber(112);
                const quoteTokenLiquidity = getRandomBigNumber(112);

                await underlyingOracle.stubPushNow(GRT, price, tokenLiquidity, quoteTokenLiquidity);

                observations.push({
                    price: price,
                    tokenLiquidity: tokenLiquidity,
                    quoteTokenLiquidity: quoteTokenLiquidity,
                });
            }

            const instantConsultation = await oracle["consult(address,uint256)"](GRT, 0);

            expect(await oracle.callStatic.update(updateData)).to.equal(true);

            const updateTx = await oracle.update(updateData);
            const updateReceipt = await updateTx.wait();

            const updateTime = await blockTimestamp(updateReceipt.blockNumber);

            // Find the updated event
            const updatedEvent = updateReceipt.events.find((event) => event.event == "Updated");

            // Expect that the Updated event was emitted
            expect(updatedEvent).to.not.equal(undefined);

            // Expect that the median was computed correctly
            const computedObservation = await computeObservation(observations);

            // Verify that the Updated event was emitted with the correct values
            expect(updatedEvent.args["price"], "Event price").to.be.closeTo(computedObservation.price, 1);
            expect(updatedEvent.args["tokenLiquidity"], "Event token liquidity").to.be.closeTo(
                computedObservation.tokenLiquidity,
                1
            );
            expect(updatedEvent.args["quoteTokenLiquidity"], "Event quote token liquidity").to.be.closeTo(
                computedObservation.quoteTokenLiquidity,
                1
            );
            expect(updatedEvent.args["timestamp"], "Event timestamp").to.equal(updateTime);

            // Verify that the median was stored correctly
            const storedObservation = await oracle.getObservationAt(GRT, 0);
            expect(storedObservation.price, "Observation price").to.be.closeTo(computedObservation.price, 1);
            expect(storedObservation.tokenLiquidity, "Observation token liquidity").to.be.closeTo(
                computedObservation.tokenLiquidity,
                1
            );
            expect(storedObservation.quoteTokenLiquidity, "Observation quote token liquidity").to.be.closeTo(
                computedObservation.quoteTokenLiquidity,
                1
            );

            // The timestamp should equal the latest timestamp of the underlying oracle
            const underlyingTimestamp = await underlyingOracle.lastUpdateTime(updateData);
            expect(storedObservation.timestamp, "Observation timestamp").to.equal(underlyingTimestamp);

            // Verify that the instant consultation before the update matches the stored observation
            expect(instantConsultation.price, "Instant consultation price").to.be.closeTo(computedObservation.price, 1);
            expect(instantConsultation.tokenLiquidity, "Instant consultation token liquidity").to.be.closeTo(
                computedObservation.tokenLiquidity,
                1
            );
            expect(instantConsultation.quoteTokenLiquidity, "Instant consultation quote token liquidity").to.be.closeTo(
                computedObservation.quoteTokenLiquidity,
                1
            );
        }

        it("Should not update if needsUpdate returns false", async function () {
            // Push observations to the underlying oracle
            for (var i = 0; i < DEFAULT_FILTER_AMOUNT; i++) {
                await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            }

            // Sanity check that the oracle needs an update
            expect(await oracle.needsUpdate(updateData)).to.equal(true);

            // Override needsUpdate to return false
            await oracle.stubOverrideNeedsUpdate(true, false);

            expect(await oracle.callStatic.update(updateData)).to.equal(false);

            await expect(oracle.update(updateData)).to.not.emit(oracle, "Updated");
        });

        it("Should update if needsUpdate returns true", async function () {
            const amountToPush = observationsRequiredForAmount(DEFAULT_FILTER_AMOUNT);

            // Push observations to the underlying oracle
            for (var i = 0; i < amountToPush; i++) {
                await underlyingOracle.stubPushNow(GRT, 2, 3, 5);
            }

            // Sanity check that the oracle needs an update
            expect(await oracle.needsUpdate(updateData)).to.equal(true);

            // Override needsUpdate to return true
            await oracle.stubOverrideNeedsUpdate(true, true);

            expect(await oracle.callStatic.update(updateData)).to.equal(true);

            await expect(oracle.update(updateData)).to.emit(oracle, "Updated");
        });

        it(
            "Computes the observation using the default number of observations w/ " + nFuzz + " rounds of fuzzing",
            async function () {
                for (var i = 0; i < nFuzz; i++) {
                    await testVariousObservations(DEFAULT_FILTER_AMOUNT);
                }
            }
        );

        for (var j = 0; j < amountsToTest.length; j++) {
            const amount = amountsToTest[j];

            it(
                "Computes the observation using " + amount + " observation w/ " + nFuzz + " rounds of fuzzing",
                async function () {
                    for (var i = 0; i < nFuzz; i++) {
                        await oracle.stubOverrideFilterAmount(true, amount);

                        await testVariousObservations(amount);
                    }
                }
            );
        }
    });

    describe(contractName + "#supportsInterface(interfaceId)", function () {
        var oracle;
        var interfaceIds;

        beforeEach(async () => {
            oracle = (await deployFunc()).oracle;
            const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
            interfaceIds = await interfaceIdsFactory.deploy();
        });

        it("Should support IOracle", async () => {
            const interfaceId = await interfaceIds.iOracle();
            expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });

        it("Should support IHistoricalOracle", async () => {
            const interfaceId = await interfaceIds.iHistoricalOracle();
            expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });
    });
}

async function computeMedianObservation(observations) {
    var prices = [];
    var tokenLiquidities = [];
    var quoteTokenLiquidities = [];

    for (var i = 0; i < observations.length; i++) {
        prices.push(observations[i].price);
        tokenLiquidities.push(observations[i].tokenLiquidity);
        quoteTokenLiquidities.push(observations[i].quoteTokenLiquidity);
    }

    prices = prices.sort((a, b) => a.sub(b));
    tokenLiquidities = tokenLiquidities.sort((a, b) => a.sub(b));
    quoteTokenLiquidities = quoteTokenLiquidities.sort((a, b) => a.sub(b));

    var medianIndex = Math.floor(prices.length / 2);

    var medianObservation;

    if (prices.length % 2 == 0) {
        // Even number of observations, take the average of the two middle observations
        medianObservation = {
            price: prices[medianIndex - 1].add(prices[medianIndex]).div(2),
            tokenLiquidity: tokenLiquidities[medianIndex - 1].add(tokenLiquidities[medianIndex]).div(2),
            quoteTokenLiquidity: quoteTokenLiquidities[medianIndex - 1].add(quoteTokenLiquidities[medianIndex]).div(2),
        };
    } else {
        // Odd number of observations, take the middle observation
        medianObservation = {
            price: prices[medianIndex],
            tokenLiquidity: tokenLiquidities[medianIndex],
            quoteTokenLiquidity: quoteTokenLiquidities[medianIndex],
        };
    }

    return medianObservation;
}

async function computePriceVolatilityObservation(observations) {
    // Compute log returns of the observation prices
    var logReturns = [];

    for (var i = 1; i < observations.length; i++) {
        logReturns.push(
            observations[i].price
                .mul(BigNumber.from(10).pow(DEFAULT_VOLATILITY_PRECISION_DECIMALS))
                .div(observations[i - 1].price)
        );
    }

    // Compute the standard deviation of the log returns
    var sum = BigNumber.from(0);

    for (var i = 0; i < logReturns.length; i++) {
        sum = sum.add(logReturns[i]);
    }

    var mean = sum.div(logReturns.length);

    sum = BigNumber.from(0);

    for (var i = 0; i < logReturns.length; i++) {
        sum = sum.add(logReturns[i].sub(mean).pow(2));
    }

    var standardDeviation = sqrt(sum.div(logReturns.length));

    const observation = {
        price: BigNumber.from(standardDeviation),
        tokenLiquidity: BigNumber.from(0),
        quoteTokenLiquidity: BigNumber.from(0),
    };

    return observation;
}

describeHistoricalAggregatorOracleTests(
    "MedianFilteringOracle",
    deployMedianFilteringOracle,
    computeMedianObservation,
    (amount) => amount,
    [1, 2, 4, 5, 6, 7]
);

describeHistoricalAggregatorOracleTests(
    "PriceVolatilityOracle",
    deployPriceVolatilityOracle,
    computePriceVolatilityObservation,
    (amount) => amount + 1,
    [2, 4, 5, 6, 7]
);
