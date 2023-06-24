const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const BAT = "0x0D8775F648430679A709E98d2b0Cb6250d2887EF";

const DEFAULT_UPDATE_THRESHOLD = 2000000; // 2% change
const DEFAULT_UPDATE_DELAY = 5; // At least 5 seconds between every update
const DEFAULT_HEARTBEAT = 60 * 60; // At most (optimistically) 1 hour between every update

const MINIMUM_TOKEN_LIQUIDITY_VALUE = BigNumber.from(0);
const MINIMUM_QUOTE_TOKEN_LIQUIDITY = BigNumber.from(0);
const MINIMUM_LIQUIDITY_RATIO = 1000; // 1:10 value(token):value(quoteToken)
const MAXIMUM_LIQUIDITY_RATIO = 100000; // 10:1 value(token):value(quoteToken)

const LOWEST_ACCEPTABLE_PRICE = BigNumber.from(2);
const LOWEST_ACCEPTABLE_LIQUIDITY = BigNumber.from(2);

const DEFAULT_AGGREGATOR_CONSTRUCTOR_PARAMS = {
    aggregationStrategy: null,
    validationStrategy: null,
    quoteTokenName: "USD Coin",
    quoteTokenAddress: USDC,
    quoteTokenSymbol: "USDC",
    quoteTokenDecimals: 6,
    liquidityDecimals: 0,
    oracles: [],
    tokenSpecificOracles: [],
    updateThreshold: DEFAULT_UPDATE_THRESHOLD,
    updateDelay: DEFAULT_UPDATE_DELAY,
    heartbeat: DEFAULT_HEARTBEAT,
};

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function harmonicMean(values, weights) {
    var numerator = BigNumber.from(0);
    var denominator = BigNumber.from(0);

    for (var i = 0; i < values.length; ++i) {
        numerator = numerator.add(weights[i]);
        denominator = denominator.add(weights[i].div(values[i]));
    }

    return numerator.div(denominator);
}

async function constructDefaultAggregator(
    factory,
    constructorOverrides,
    minimumTokenLiquidityValue = MINIMUM_TOKEN_LIQUIDITY_VALUE,
    minimumQuoteTokenLiquidity = MINIMUM_QUOTE_TOKEN_LIQUIDITY,
    minimumLiquidityRatio = MINIMUM_LIQUIDITY_RATIO,
    maximumLiquidityRatio = MAXIMUM_LIQUIDITY_RATIO
) {
    var params = {
        ...DEFAULT_AGGREGATOR_CONSTRUCTOR_PARAMS,
        ...constructorOverrides,
    };

    if (params.aggregationStrategy === null) {
        const aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator");
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        params = {
            ...params,
            aggregationStrategy: aggregationStrategy.address,
        };
    }

    if (params.validationStrategy === null) {
        const validationStrategyFactory = await ethers.getContractFactory("DefaultValidationStub");

        const validationStrategy = await validationStrategyFactory.deploy(
            params.quoteTokenDecimals,
            minimumTokenLiquidityValue,
            minimumQuoteTokenLiquidity,
            minimumLiquidityRatio,
            maximumLiquidityRatio
        );
        await validationStrategy.deployed();

        params = {
            ...params,
            validationStrategy: validationStrategy.address,
        };
    }

    const updateThreshold = params.updateThreshold;
    const updateDelay = params.updateDelay;
    const heartbeat = params.heartbeat;

    delete params.updateThreshold;
    delete params.updateDelay;
    delete params.heartbeat;

    return await factory.deploy(params, updateThreshold, updateDelay, heartbeat);
}

describe("CurrentAggregatorOracle#constructor", async function () {
    var underlyingOracleFactory;
    var oracleFactory;
    var aggregationStrategyFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracle");
        underlyingOracleFactory = await ethers.getContractFactory("MockOracle");
        aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator");
    });

    it("Should deploy correctly with valid arguments", async function () {
        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        const oracle2 = await underlyingOracleFactory.deploy(USDC);
        await oracle2.deployed();

        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const grtOracle = {
            token: GRT,
            oracle: oracle2.address,
        };

        const validationStrategyAddress = AddressZero;
        const quoteTokenName = "USD Coin";
        const quoteTokenAddress = USDC;
        const quoteTokenSymbol = "USDC";
        const quoteTokenDecimals = 6;
        const liquidityDecimals = 4;
        const oracles = [oracle1.address];
        const tokenSpecificOracles = [grtOracle];
        const updateThreshold = DEFAULT_UPDATE_THRESHOLD * 2;
        const updateDelay = DEFAULT_UPDATE_DELAY * 2;
        const heartbeat = DEFAULT_HEARTBEAT * 2;

        const oracle = await oracleFactory.deploy(
            {
                aggregationStrategy: aggregationStrategy.address,
                validationStrategy: validationStrategyAddress,
                quoteTokenName,
                quoteTokenAddress,
                quoteTokenSymbol,
                quoteTokenDecimals,
                liquidityDecimals,
                oracles,
                tokenSpecificOracles,
            },
            updateThreshold,
            updateDelay,
            heartbeat
        );

        const generalOracles = [
            [oracle1.address, await oracle1.quoteTokenDecimals(), await oracle1.liquidityDecimals()],
        ];

        const grtOracles = [
            ...generalOracles,
            [oracle2.address, await oracle2.quoteTokenDecimals(), await oracle2.liquidityDecimals()],
        ];

        expect(await oracle.aggregationStrategy(BAT)).to.equal(aggregationStrategy.address);
        expect(await oracle.validationStrategy(BAT)).to.equal(validationStrategyAddress);
        expect(await oracle.quoteTokenName()).to.equal(quoteTokenName);
        expect(await oracle.quoteTokenAddress()).to.equal(quoteTokenAddress);
        expect(await oracle.quoteTokenSymbol()).to.equal(quoteTokenSymbol);
        expect(await oracle.quoteTokenDecimals()).to.equal(quoteTokenDecimals);
        expect(await oracle.liquidityDecimals()).to.equal(liquidityDecimals);
        expect(await oracle.getOracles(BAT)).to.eql(generalOracles); // eql = deep equality
        expect(await oracle.updateThreshold()).to.equal(updateThreshold);
        expect(await oracle.updateDelay()).to.equal(updateDelay);
        expect(await oracle.heartbeat()).to.equal(heartbeat);

        expect(await oracle.getOracles(grtOracle.token)).to.eql(grtOracles);
    });

    it("Should not revert if no underlying oracles are provided", async () => {
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const validationStrategyAddress = AddressZero;

        await expect(
            oracleFactory.deploy(
                {
                    aggregationStrategy: aggregationStrategy.address,
                    validationStrategy: validationStrategyAddress,
                    quoteTokenName: "NAME",
                    quoteTokenAddress: USDC,
                    quoteTokenSymbol: "NIL",
                    quoteTokenDecimals: 18,
                    liquidityDecimals: 0,
                    oracles: [],
                    tokenSpecificOracles: [],
                },
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY,
                DEFAULT_HEARTBEAT
            )
        ).to.not.be.reverted;
    });

    it("Should revert if duplicate general oracles are provided", async () => {
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const validationStrategyAddress = AddressZero;

        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        await expect(
            oracleFactory.deploy(
                {
                    aggregationStrategy: aggregationStrategy.address,
                    validationStrategy: validationStrategyAddress,
                    quoteTokenName: "NAME",
                    quoteTokenAddress: USDC,
                    quoteTokenSymbol: "NIL",
                    quoteTokenDecimals: 18,
                    liquidityDecimals: 0,
                    oracles: [oracle1.address, oracle1.address],
                    tokenSpecificOracles: [],
                },
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY,
                DEFAULT_HEARTBEAT
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: DUPLICATE_ORACLE");
    });

    it("Should revert if duplicate token specific oracles are provided", async () => {
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const validationStrategyAddress = AddressZero;

        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        const oracle1Config = {
            token: GRT,
            oracle: oracle1.address,
        };

        await expect(
            oracleFactory.deploy(
                {
                    aggregationStrategy: aggregationStrategy.address,
                    validationStrategy: validationStrategyAddress,
                    quoteTokenName: "NAME",
                    quoteTokenAddress: USDC,
                    quoteTokenSymbol: "NIL",
                    quoteTokenDecimals: 18,
                    liquidityDecimals: 0,
                    oracles: [],
                    tokenSpecificOracles: [oracle1Config, oracle1Config],
                },
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY,
                DEFAULT_HEARTBEAT
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: DUPLICATE_ORACLE");
    });

    it("Should revert if duplicate general / token specific oracles are provided", async () => {
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const validationStrategyAddress = AddressZero;

        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        const oracle1Config = {
            token: GRT,
            oracle: oracle1.address,
        };

        await expect(
            oracleFactory.deploy(
                {
                    aggregationStrategy: aggregationStrategy.address,
                    validationStrategy: validationStrategyAddress,
                    quoteTokenName: "NAME",
                    quoteTokenAddress: USDC,
                    quoteTokenSymbol: "NIL",
                    quoteTokenDecimals: 18,
                    liquidityDecimals: 0,
                    oracles: [oracle1.address],
                    tokenSpecificOracles: [oracle1Config],
                },
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY,
                DEFAULT_HEARTBEAT
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: DUPLICATE_ORACLE");
    });

    it("Should revert if heartbeat exceeds the update delay", async function () {
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const validationStrategyAddress = AddressZero;

        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        await expect(
            oracleFactory.deploy(
                {
                    aggregationStrategy: aggregationStrategy.address,
                    validationStrategy: validationStrategyAddress,
                    quoteTokenName: "NAME",
                    quoteTokenAddress: USDC,
                    quoteTokenSymbol: "NIL",
                    quoteTokenDecimals: 18,
                    liquidityDecimals: 0,
                    oracles: [oracle1.address],
                    tokenSpecificOracles: [],
                },
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY + 1,
                DEFAULT_UPDATE_DELAY
            )
        ).to.be.revertedWith("InvalidUpdateDelays");
    });

    it("Should revert if the quote token decimals is different from that of the validation strategy", async function () {
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const validationStrategyFactory = await ethers.getContractFactory("DefaultValidation");
        const validationStrategy = await validationStrategyFactory.deploy(21, 0, 0, 0, 0);
        await validationStrategy.deployed();

        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        await expect(
            oracleFactory.deploy(
                {
                    aggregationStrategy: aggregationStrategy.address,
                    validationStrategy: validationStrategy.address,
                    quoteTokenName: "NAME",
                    quoteTokenAddress: USDC,
                    quoteTokenSymbol: "NIL",
                    quoteTokenDecimals: 17,
                    liquidityDecimals: 0,
                    oracles: [oracle1.address],
                    tokenSpecificOracles: [],
                },
                DEFAULT_UPDATE_THRESHOLD,
                DEFAULT_UPDATE_DELAY,
                DEFAULT_UPDATE_DELAY
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: QUOTE_TOKEN_DECIMALS_MISMATCH");
    });
});

describe("CurrentAggregatorOracle#needsUpdate", function () {
    var oracle;
    var updateTime;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Override changeThresholdPassed (false)
        await oracle.overrideChangeThresholdPassed(true, false);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        // Initial update for GRT

        updateTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            updateTime
        );

        // Sanity check that the aggregator update time is correct
        expect(await oracle.lastUpdateTime(ethers.utils.hexZeroPad(GRT, 32))).to.equal(updateTime);
    });

    it("Should require an update if no observations have been made", async () => {
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(BAT, 32))).to.equal(true);
    });

    it("Shouldn't need update if delta time is less than the min update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await oracle.overrideChangeThresholdPassed(true, true);

        // deltaTime = 1
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

        // deltaTime = DEFAULT_UPDATE_DELAY - 1
        await hre.timeAndMine.setTime(updateTime + DEFAULT_UPDATE_DELAY - 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });

    it("Shouldn't need update if delta time is less than the min update delay (update threshold not passed)", async () => {
        // deltaTime = 1
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

        // deltaTime = DEFAULT_UPDATE_DELAY - 1
        await hre.timeAndMine.setTime(updateTime + DEFAULT_UPDATE_DELAY - 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });

    it("Should need update if delta time is within min and max update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await oracle.overrideChangeThresholdPassed(true, true);

        // deltaTime = DEFAULT_UPDATE_DELAY
        await hre.timeAndMine.setTime(updateTime + DEFAULT_UPDATE_DELAY);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32)), "deltaTime = DEFAULT_UPDATE_DELAY").to.equal(
            true
        );

        // deltaTime = DEFAULT_HEARTBEAT - 1
        await hre.timeAndMine.setTime(updateTime + DEFAULT_HEARTBEAT - 1);
        expect(
            await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32)),
            "deltaTime = DEFAULT_HEARTBEAT - 1"
        ).to.equal(true);
    });

    it("Shouldn't need update if delta time is within min and max update delay (update threshold not passed)", async () => {
        // deltaTime = DEFAULT_UPDATE_DELAY
        await hre.timeAndMine.setTime(updateTime + DEFAULT_UPDATE_DELAY);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);

        // deltaTime = DEFAULT_HEARTBEAT - 1
        await hre.timeAndMine.setTime(updateTime + DEFAULT_HEARTBEAT - 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });

    it("Should need update if delta time is >= max update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await oracle.overrideChangeThresholdPassed(true, true);

        // deltaTime = DEFAULT_HEARTBEAT
        await hre.timeAndMine.setTime(updateTime + DEFAULT_HEARTBEAT);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

        // deltaTime = DEFAULT_HEARTBEAT + 1
        await hre.timeAndMine.setTime(updateTime + DEFAULT_HEARTBEAT + 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
    });

    it("Should need update if delta time is >= max update delay (update threshold not passed)", async () => {
        // deltaTime = DEFAULT_HEARTBEAT
        await hre.timeAndMine.setTime(updateTime + DEFAULT_HEARTBEAT);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);

        // deltaTime = DEFAULT_HEARTBEAT + 1
        await hre.timeAndMine.setTime(updateTime + DEFAULT_HEARTBEAT + 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
    });
});

describe("CurrentAggregatorOracle#canUpdate", function () {
    var oracle;
    var validationStrategy;

    var underlyingOracle1;
    var underlyingOracle2;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");
        const validationStrategyFactory = await ethers.getContractFactory("ValidationStub");

        validationStrategy = await validationStrategyFactory.deploy();
        await validationStrategy.deployed();
        await validationStrategy.stubSetQuoteTokenDecimals(DEFAULT_AGGREGATOR_CONSTRUCTOR_PARAMS.quoteTokenDecimals);

        underlyingOracle1 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle1.deployed();

        underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        const constructorOverrides = {
            validationStrategy: validationStrategy.address,
            oracles: [underlyingOracle1.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    describe("Can't update when it", function () {
        it("Doesn't need an update", async function () {
            await oracle.overrideNeedsUpdate(true, false);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
        });

        it("Needs an update but there are no valid underlying oracle responses", async function () {
            await oracle.overrideNeedsUpdate(true, true);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
        });

        it("Needs an update but all of the underlying oracles fail validation", async function () {
            await validationStrategy.stubSetIsValid(false);

            await underlyingOracle1.stubSetNeedsUpdate(false);

            const currentTime = await currentBlockTimestamp();

            await underlyingOracle1.stubSetObservation(GRT, 1, 1, 1, currentTime);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
        });
    });

    describe("Can update when it needs an update and when", function () {
        beforeEach(async function () {
            await oracle.overrideNeedsUpdate(true, true);
        });

        it("An underlying oracle doesn't need an update but it has valid data", async function () {
            await underlyingOracle1.stubSetNeedsUpdate(false);

            const currentTime = await currentBlockTimestamp();

            await underlyingOracle1.stubSetObservation(
                GRT,
                LOWEST_ACCEPTABLE_PRICE,
                LOWEST_ACCEPTABLE_LIQUIDITY,
                LOWEST_ACCEPTABLE_LIQUIDITY,
                currentTime
            );

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
        });
    });
});

describe("CurrentAggregatorOracle#updateThresholdSurpassed", function () {
    var underlyingOracle1;
    var underlyingOracle2;

    var oracleWith1Underlying;
    var oracleWith2Underlyings;

    var updateData;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle1 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle1.deployed();

        underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        const constructorOverrides1Underlying = {
            validationStrategy: AddressZero,
            oracles: [underlyingOracle1.address],
        };
        const constructorOverrides2Underlying = {
            validationStrategy: AddressZero,
            oracles: [underlyingOracle1.address, underlyingOracle2.address],
        };

        oracleWith1Underlying = await constructDefaultAggregator(oracleFactory, constructorOverrides1Underlying);
        oracleWith2Underlyings = await constructDefaultAggregator(oracleFactory, constructorOverrides2Underlying);

        updateData = ethers.utils.hexZeroPad(GRT, 32);
    });

    it("Returns false when none of the underlying oracles have observations", async function () {
        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(false);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(false);
    });

    it("Returns false when all of the underlying oracles have old observations", async function () {
        const oldTime = 100;

        await underlyingOracle1.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            oldTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            oldTime
        );

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(false);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(false);
    });

    it("Returns false when one of the underlying oracles has a valid observation, but we require at least 2", async function () {
        const currentTime = await currentBlockTimestamp();
        const oldTime = 100;

        await underlyingOracle1.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            oldTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 2);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 2);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(false);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(false);
    });

    it("Returns false when all (2) of the underlying oracles have valid observations, but we require at least 3", async function () {
        const currentTime = await currentBlockTimestamp();

        await underlyingOracle1.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 3);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 3);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(false);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(false);
    });

    it("Returns true when one of the underlying oracles has a valid observation, we require at least 1, and the aggregator doesn't have an observation yet", async function () {
        const currentTime = await currentBlockTimestamp();

        await underlyingOracle1.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 1);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 1);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(true);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(true);
    });

    it("Returns true when all of the underlying oracles have valid observations, we require at least 1, and the aggregator doesn't have an observation yet", async function () {
        const currentTime = await currentBlockTimestamp();

        await underlyingOracle1.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 1);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 1);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(true);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(true);
    });

    it("Returns true when the average of the underlying oracles is above the threshold (with both underlying exceeding the threshold and the new price moving up)", async function () {
        const currentTime = await currentBlockTimestamp();

        const observedPrice = ethers.utils.parseUnits("1", 18);
        // Set the observations of the aggregators
        await oracleWith1Underlying.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await oracleWith2Underlyings.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        const newPrice = observedPrice.mul(100000000 + DEFAULT_UPDATE_THRESHOLD).div(100000000);

        await underlyingOracle1.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 1);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 1);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(true);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(true);
    });

    it("Returns true when the average of the underlying oracles is above the threshold (with both underlying exceeding the threshold and the new price moving down)", async function () {
        const currentTime = await currentBlockTimestamp();

        const observedPrice = ethers.utils.parseUnits("1", 18);
        // Set the observations of the aggregators
        await oracleWith1Underlying.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await oracleWith2Underlyings.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        const newPrice = observedPrice.mul(100000000 - DEFAULT_UPDATE_THRESHOLD).div(100000000);

        await underlyingOracle1.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 1);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 1);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(true);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(true);
    });

    it("Returns false when the average of the underlying oracles is below the threshold", async function () {
        const currentTime = await currentBlockTimestamp();

        const observedPrice = ethers.utils.parseUnits("1", 18);
        // Set the observations of the aggregators
        await oracleWith1Underlying.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await oracleWith2Underlyings.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        const newPrice = observedPrice
            .mul(100000000 + DEFAULT_UPDATE_THRESHOLD)
            .div(100000000)
            .sub(1);

        await underlyingOracle1.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 1);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 1);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(false);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(false);
    });

    it("Returns true when the average of the underlying oracles is above the threshold (with only 1 underlying exceeding the threshold and the new price moving up)", async function () {
        const currentTime = await currentBlockTimestamp();

        const observedPrice = ethers.utils.parseUnits("1", 18);
        // Set the observations of the aggregators
        await oracleWith1Underlying.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await oracleWith2Underlyings.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        const newPrice = observedPrice.mul(100000000 + DEFAULT_UPDATE_THRESHOLD * 3).div(100000000);

        await underlyingOracle1.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 1);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 1);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(true);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(true);
    });

    it("Returns true when the average of the underlying oracles is above the threshold (with only 1 underlying exceeding the threshold and the new price moving down)", async function () {
        const currentTime = await currentBlockTimestamp();

        const observedPrice = ethers.utils.parseUnits("1", 18);
        // Set the observations of the aggregators
        await oracleWith1Underlying.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await oracleWith2Underlyings.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        const newPrice = observedPrice.mul(100000000 - DEFAULT_UPDATE_THRESHOLD * 3).div(100000000);

        await underlyingOracle1.stubSetObservation(
            GRT,
            newPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );
        await underlyingOracle2.stubSetObservation(
            GRT,
            observedPrice,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            currentTime
        );

        await oracleWith1Underlying.overrideMinimumResponses(true, 1);
        await oracleWith2Underlyings.overrideMinimumResponses(true, 1);

        expect(await oracleWith1Underlying.updateThresholdSurpassed(updateData)).to.equal(true);
        expect(await oracleWith2Underlyings.updateThresholdSurpassed(updateData)).to.equal(true);
    });
});

describe("CurrentAggregatorOracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultPrice(address)"](GRT)).to.be.revertedWith("AbstractOracle: MISSING_OBSERVATION");
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const price = LOWEST_ACCEPTABLE_PRICE;

        await oracle.stubSetObservation(GRT, price, LOWEST_ACCEPTABLE_LIQUIDITY, LOWEST_ACCEPTABLE_LIQUIDITY, 1);

        expect(await oracle["consultPrice(address)"](GRT)).to.equal(price);
    });

    it("Should get the set price (=1e18)", async () => {
        const price = BigNumber.from(10).pow(18);

        await oracle.stubSetObservation(GRT, price, LOWEST_ACCEPTABLE_LIQUIDITY, LOWEST_ACCEPTABLE_LIQUIDITY, 1);

        expect(await oracle["consultPrice(address)"](GRT)).to.equal(price);
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const price = await oracle["consultPrice(address)"](await oracle.quoteTokenAddress());

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
    });
});

describe("CurrentAggregatorOracle#consultPrice(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        expect(await oracle["consultPrice(address,uint256)"](GRT, 0)).to.equal(price);
    });
});

describe("CurrentAggregatorOracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const observationTime = await currentBlockTimestamp();
        const price = LOWEST_ACCEPTABLE_PRICE;

        await oracle.stubSetObservation(
            GRT,
            price,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            observationTime
        );

        expect(await oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.equal(price);
    });

    it("Should get the set price (=1e18)", async () => {
        const observationTime = await currentBlockTimestamp();
        const price = BigNumber.from(10).pow(18);

        await oracle.stubSetObservation(
            GRT,
            price,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            observationTime
        );

        expect(await oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.equal(price);
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const price = await oracle["consultPrice(address,uint256)"](await oracle.quoteTokenAddress(), MAX_AGE);

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
    });
});

describe("CurrentAggregatorOracle#consultLiquidity(token)", function () {
    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address)"](GRT)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](
            await oracle.quoteTokenAddress()
        );

        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set token liquidity (=${args["tokenLiquidity"]}) and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(GRT, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](GRT);

            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("CurrentAggregatorOracle#consultLiquidity(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it(`Should get the set liquidity (=(2, 3))`, async () => {
        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        const liquitity = await oracle["consultLiquidity(address,uint256)"](GRT, 0);

        expect(liquitity["tokenLiquidity"]).to.equal(tokenLiqudity);
        expect(liquitity["quoteTokenLiquidity"]).to.equal(quoteTokenLiquidity);
    });
});

describe("CurrentAggregatorOracle#consultLiquidity(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
            await oracle.quoteTokenAddress(),
            MAX_AGE
        );

        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set token liquidity (=${args["tokenLiquidity"]}) and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(GRT, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
                GRT,
                MAX_AGE
            );

            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("CurrentAggregatorOracle#consult(token)", function () {
    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consult(address)"](GRT)).to.be.revertedWith("AbstractOracle: MISSING_OBSERVATION");
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address)"](
            await oracle.quoteTokenAddress()
        );

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set price (=${args["price"]}), token liquidity (=${args["tokenLiquidity"]}), and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(GRT, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address)"](GRT);

            expect(price).to.equal(_price);
            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("CurrentAggregatorOracle#consult(token, maxAge = 0)", function () {
    var oracleFactory;
    var mockOracleFactory;
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        mockOracleFactory = await ethers.getContractFactory("MockOracle");
        oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        const consultation = await oracle["consult(address,uint256)"](GRT, 0);

        expect(consultation["price"]).to.equal(price);
        expect(consultation["tokenLiquidity"]).to.equal(tokenLiqudity);
        expect(consultation["quoteTokenLiquidity"]).to.equal(quoteTokenLiquidity);
    });

    it("Should revert when there are no valid responses", async function () {
        await underlyingOracle.stubSetConsultError(true);

        await expect(oracle["consult(address,uint256)"](GRT, 0)).to.be.revertedWith(
            "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
        );
    });

    it("Should revert when the price exceeds uint112.max", async function () {
        const aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator");
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        // Redeploy with more quote token decimal places
        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals + 1,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        const price = BigNumber.from(2).pow(112).sub(1); // = uint112.max
        const tokenLiqudity = BigNumber.from(200);
        const quoteTokenLiquidity = BigNumber.from(300);

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        // Sanity checks
        expect(await underlyingOracle.quoteTokenDecimals()).to.equal(
            6,
            "Underlying oracle should use 6 decimals for the price"
        );
        expect(await oracle.quoteTokenDecimals()).to.equal(7, "Aggregated oracle should use 7 decimals for the price");

        await expect(oracle["consult(address,uint256)"](GRT, 0)).to.be.reverted;
    });

    it("Should report token liquidity of uint112.max when it exceeds that", async function () {
        const aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator");
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        // Redeploy with additional underlying oracle
        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address, underlyingOracle2.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = BigNumber.from(2).pow(112).sub(1); // = uint112.max
        const quoteTokenLiquidity = LOWEST_ACCEPTABLE_LIQUIDITY;

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);
        await underlyingOracle2.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        const totalTokenLiquidity = BigNumber.from(2).pow(112).sub(1); // = uint112.max
        const totalQuoteTokenLiquidity = quoteTokenLiquidity.mul(2);

        const consultation = await oracle["consult(address,uint256)"](GRT, 0);

        expect(consultation["price"]).to.equal(price);
        expect(consultation["tokenLiquidity"]).to.equal(totalTokenLiquidity);
        expect(consultation["quoteTokenLiquidity"]).to.equal(totalQuoteTokenLiquidity);
    });

    it("Should report quote token liquidity of uint112.max when it exceeds that", async function () {
        const aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator");
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        // Redeploy with additional underlying oracle
        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address, underlyingOracle2.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = LOWEST_ACCEPTABLE_LIQUIDITY;
        const quoteTokenLiquidity = BigNumber.from(2).pow(112).sub(1); // = uint112.max

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);
        await underlyingOracle2.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        const totalTokenLiquidity = tokenLiqudity.mul(2);
        const totalQuoteTokenLiquidity = BigNumber.from(2).pow(112).sub(1); // = uint112.max

        const consultation = await oracle["consult(address,uint256)"](GRT, 0);

        expect(consultation["price"]).to.equal(price);
        expect(consultation["tokenLiquidity"]).to.equal(totalTokenLiquidity);
        expect(consultation["quoteTokenLiquidity"]).to.equal(totalQuoteTokenLiquidity);
    });

    it("Should report liquidities of uint112.max when they exceeds that", async function () {
        const aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator");
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        // Redeploy with additional underlying oracle
        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address, underlyingOracle2.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = BigNumber.from(2).pow(112).sub(1); // = uint112.max
        const quoteTokenLiquidity = BigNumber.from(2).pow(112).sub(1); // = uint112.max

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);
        await underlyingOracle2.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        const totalTokenLiquidity = BigNumber.from(2).pow(112).sub(1); // = uint112.max
        const totalQuoteTokenLiquidity = BigNumber.from(2).pow(112).sub(1); // = uint112.max

        const consultation = await oracle["consult(address,uint256)"](GRT, 0);

        expect(consultation["price"]).to.equal(price);
        expect(consultation["tokenLiquidity"]).to.equal(totalTokenLiquidity);
        expect(consultation["quoteTokenLiquidity"]).to.equal(totalQuoteTokenLiquidity);
    });
});

describe("CurrentAggregatorOracle#consult(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    const tests = [
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from(1),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from(1),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from(1),
            },
        },
        {
            args: {
                price: BigNumber.from("1000000000000000000"),
                tokenLiquidity: BigNumber.from("1000000000000000000"),
                quoteTokenLiquidity: BigNumber.from("1000000000000000000"),
            },
        },
    ];

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const quoteTokenDecimals = await underlyingOracle.quoteTokenDecimals();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenDecimals: quoteTokenDecimals,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address,uint256)"](
            await oracle.quoteTokenAddress(),
            MAX_AGE
        );

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
        expect(tokenLiqudity).to.equal(0);
        expect(quoteTokenLiquidity).to.equal(0);
    });

    tests.forEach(({ args }) => {
        it(`Should get the set price (=${args["price"]}), token liquidity (=${args["tokenLiquidity"]}), and quote token liquidity (=${args["quoteTokenLiquidity"]})`, async () => {
            const _price = args["price"];
            const _tokenLiqudity = args["tokenLiquidity"];
            const _quoteTokenLiquidity = args["quoteTokenLiquidity"];

            const observationTime = await currentBlockTimestamp();

            await oracle.stubSetObservation(GRT, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address,uint256)"](GRT, MAX_AGE);

            expect(price).to.equal(_price);
            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("CurrentAggregatorOracle#update w/ 1 underlying oracle", function () {
    const quoteToken = USDC;
    const token = GRT;

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        await underlyingOracle.stubSetLiquidityDecimals(6);

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 6,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should update successfully", async () => {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 1);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Should update successfully with a very high price and the lowest possible liquidity", async () => {
        // Note: 2^112-1 as the price gets rounded to 2^112 when calculating the harmonic mean (loss of precision).
        // This can't fit inside a uint112 and SafeCast will throw.
        const price = BigNumber.from(2).pow(111);
        const tokenLiquidity = LOWEST_ACCEPTABLE_LIQUIDITY;
        const quoteTokenLiquidity = LOWEST_ACCEPTABLE_LIQUIDITY;
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 1);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Has correct price when the oracle has delta +2 quote token decimals", async function () {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await oracle.stubSetQuoteTokenDecimals((await oracle.quoteTokenDecimals()) + 2);
        // Increase by 2 decimal places (delta from underlying is +2), so multiply by 10^2
        const expectedPrice = price.mul(100);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, tokenLiquidity, quoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 1);

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(expectedPrice);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Has correct price when the oracle has delta -2 quote token decimals", async function () {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await oracle.stubSetQuoteTokenDecimals((await oracle.quoteTokenDecimals()) - 2);
        // Decrease by 2 decimal places (delta from underlying is -2), so divide by 10^2
        const expectedPrice = price.div(100);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, tokenLiquidity, quoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 1);

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(expectedPrice);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Has correct liquidity when the oracle has delta +2 liquidity decimals", async function () {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await oracle.stubSetLiquidityDecimals((await underlyingOracle.liquidityDecimals()) + 2);
        // Increase by 2 decimal places (delta from underlying is +2), so multiply by 10^2
        const expectedTokenLiquidity = tokenLiquidity.mul(100);
        const expectedQuoteTokenLiquidity = quoteTokenLiquidity.mul(100);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, price, expectedTokenLiquidity, expectedQuoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 1);

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(expectedTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Has correct liquidity when the oracle has delta -2 liquidity decimals", async function () {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await oracle.stubSetLiquidityDecimals((await underlyingOracle.liquidityDecimals()) - 2);
        // Decrease by 2 decimal places (delta from underlying is -2), so divide by 10^2
        const expectedTokenLiquidity = tokenLiquidity.div(100);
        const expectedQuoteTokenLiquidity = quoteTokenLiquidity.div(100);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, price, expectedTokenLiquidity, expectedQuoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 1);

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(expectedTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Shouldn't use old rates", async () => {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + DEFAULT_HEARTBEAT * 2 + 1;

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await oracle.update(ethers.utils.hexZeroPad(token, 32));

        // Consult errors are no longer emitted
        //await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
        //    .to.emit(oracle, "ConsultErrorWithReason")
        //    .withArgs(underlyingOracle.address, token, "AbstractOracle: RATE_TOO_OLD");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Should catch underlying consult errors and not update", async () => {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await underlyingOracle.stubSetConsultError(true);
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(false);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await oracle.update(ethers.utils.hexZeroPad(token, 32));

        // Consult errors are no longer emitted
        //await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
        //    .to.emit(oracle, "ConsultError")
        //    .withArgs(
        //        underlyingOracle.address,
        //        token,
        //        "0x4e487b710000000000000000000000000000000000000000000000000000000000000011"
        //    );

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when there aren't any valid consultations", async () => {
        const timestamp = (await currentBlockTimestamp()) + 10;

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price is 0", async () => {
        // Deploy the aggregator with the default validation strategy
        const constructorOverrides = {
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 6,
            oracles: [underlyingOracle.address],
        };
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");
        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides, 0, 0, 0, MaxUint256);

        const price = BigNumber.from(0);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's quote token liquidity is 0", async () => {
        // Deploy the aggregator with the default validation strategy
        const constructorOverrides = {
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 6,
            oracles: [underlyingOracle.address],
        };
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");
        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides, 0, 0, 0, MaxUint256);

        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = BigNumber.from(0);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price and quote token liquidity is 0", async () => {
        // Deploy the aggregator with the default validation strategy
        const constructorOverrides = {
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 6,
            oracles: [underlyingOracle.address],
        };
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");
        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides, 0, 0, 0, MaxUint256);

        const price = BigNumber.from(0);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = BigNumber.from(0);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the price doesn't move at all", async () => {
        const observationTime = (await currentBlockTimestamp()) - DEFAULT_UPDATE_DELAY - 1;

        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);
        await oracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Check that update returns false
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(false);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that no event was emitted
        expect(receipt.events).to.be.empty;

        // Expect that the last update time hasn't changed
        expect(await oracle.lastUpdateTime(ethers.utils.hexZeroPad(token, 32))).to.equal(observationTime);
    });

    it("Shouldn't update when the price moves below the update threshold (with the price moving up)", async () => {
        const observationTime = (await currentBlockTimestamp()) - DEFAULT_UPDATE_DELAY - 1;

        const oldPrice = ethers.utils.parseUnits("1", 18);
        const newPrice = oldPrice
            .mul(100000000 + DEFAULT_UPDATE_THRESHOLD)
            .div(100000000)
            .sub(1);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(
            token,
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            observationTime
        );
        await oracle.stubSetObservation(token, oldPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Check that update returns false
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(false);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that no event was emitted
        expect(receipt.events).to.be.empty;

        // Expect that the last update time hasn't changed
        expect(await oracle.lastUpdateTime(ethers.utils.hexZeroPad(token, 32))).to.equal(observationTime);
    });

    it("Shouldn't update when the price moves below the update threshold (with the price moving down)", async () => {
        const observationTime = (await currentBlockTimestamp()) - DEFAULT_UPDATE_DELAY - 1;

        const newPrice = ethers.utils.parseUnits("1", 18);
        const oldPrice = newPrice
            .mul(100000000 + DEFAULT_UPDATE_THRESHOLD)
            .div(100000000)
            .sub(1);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(
            token,
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            observationTime
        );
        await oracle.stubSetObservation(token, oldPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Check that update returns false
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(false);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that no event was emitted
        expect(receipt.events).to.be.empty;

        // Expect that the last update time hasn't changed
        expect(await oracle.lastUpdateTime(ethers.utils.hexZeroPad(token, 32))).to.equal(observationTime);
    });

    it("Should update when the price moves above the update threshold (with the price moving up)", async () => {
        const observationTime = (await currentBlockTimestamp()) - DEFAULT_UPDATE_DELAY - 1;

        const oldPrice = ethers.utils.parseUnits("1", 18);
        const newPrice = oldPrice.mul(100000000 + DEFAULT_UPDATE_THRESHOLD).div(100000000);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(
            token,
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            observationTime
        );
        await oracle.stubSetObservation(token, oldPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Check that update returns true
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(true);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that `Updated` was emitted
        expect(receipt)
            .to.emit(oracle, "Updated")
            .withArgs(token, newPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        expect(receipt).to.emit(oracle, "AggregationPerformed").withArgs(token, observationTime, 1);

        const updateTime = await blockTimestamp(receipt.blockNumber);

        // Expect that the new observation is what we expect
        expect(await oracle.getLatestObservation(token)).to.deep.equal([
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            updateTime,
        ]);
    });

    it("Should update when the price moves above the update threshold (with the price moving down)", async () => {
        const observationTime = (await currentBlockTimestamp()) - DEFAULT_UPDATE_DELAY - 1;

        const newPrice = ethers.utils.parseUnits("1", 18);
        const oldPrice = newPrice.mul(100000000 + DEFAULT_UPDATE_THRESHOLD).div(100000000);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(
            token,
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            observationTime
        );
        await oracle.stubSetObservation(token, oldPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Check that update returns true
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(true);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that `Updated` was emitted
        expect(receipt)
            .to.emit(oracle, "Updated")
            .withArgs(token, newPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        expect(receipt).to.emit(oracle, "AggregationPerformed").withArgs(token, observationTime, 1);

        const updateTime = await blockTimestamp(receipt.blockNumber);

        // Expect that the new observation is what we expect
        expect(await oracle.getLatestObservation(token)).to.deep.equal([
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            updateTime,
        ]);
    });

    it("Should update when the price doesn't move at all, but a heartbeat is needed", async () => {
        const observationTime = (await currentBlockTimestamp()) - DEFAULT_HEARTBEAT - 1;

        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);
        await oracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Check that update returns true
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(true);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that `Updated` was emitted
        expect(receipt)
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);

        expect(receipt).to.emit(oracle, "AggregationPerformed").withArgs(token, observationTime, 1);

        const updateTime = await blockTimestamp(receipt.blockNumber);

        // Expect that the new observation is what we expect
        expect(await oracle.getLatestObservation(token)).to.deep.equal([
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            updateTime,
        ]);
    });

    it("Shouldn't update when the price moves above the update threshold (with the price moving up), but the minimum delay hasn't been reached", async () => {
        const observationTime = (await currentBlockTimestamp()) + 100;

        const oldPrice = ethers.utils.parseUnits("1", 18);
        const newPrice = oldPrice.mul(100000000 + DEFAULT_UPDATE_THRESHOLD).div(100000000);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(
            token,
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            observationTime
        );
        await oracle.stubSetObservation(token, oldPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Set the time to the observation time
        await hre.timeAndMine.setTime(observationTime);

        // Check that update returns false
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(false);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that no event was emitted
        expect(receipt.events).to.be.empty;

        // Expect that the last update time hasn't changed
        expect(await oracle.lastUpdateTime(ethers.utils.hexZeroPad(token, 32))).to.equal(observationTime);
    });

    it("Shouldn't update when the price moves above the update threshold (with the price moving down), but the minimum delay hasn't been reached", async () => {
        const observationTime = (await currentBlockTimestamp()) - DEFAULT_UPDATE_DELAY + 100;

        const newPrice = ethers.utils.parseUnits("1", 18);
        const oldPrice = newPrice.mul(100000000 + DEFAULT_UPDATE_THRESHOLD).div(100000000);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(
            token,
            newPrice,
            tokenLiquidity,
            quoteTokenLiquidity,
            observationTime
        );
        await oracle.stubSetObservation(token, oldPrice, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Set the time to the observation time
        await hre.timeAndMine.setTime(observationTime);

        // Check that update returns false
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(false);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that no event was emitted
        expect(receipt.events).to.be.empty;

        // Expect that the last update time hasn't changed
        expect(await oracle.lastUpdateTime(ethers.utils.hexZeroPad(token, 32))).to.equal(observationTime);
    });
});

describe("CurrentAggregatorOracle#update w/ 2 underlying oracle", function () {
    const quoteToken = USDC;
    const token = GRT;

    var underlyingOracle1;
    var underlyingOracle2;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle1 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle1.deployed();

        underlyingOracle2 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle2.deployed();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 0,
            oracles: [underlyingOracle1.address, underlyingOracle2.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should set observation liquitities to (2^112)-1 when total liquitities >= 2^112", async function () {
        var price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = BigNumber.from(2).pow(112).sub(1);
        const quoteTokenLiquidity = BigNumber.from(2).pow(112).sub(1);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle1.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await underlyingOracle2.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        // Liquitities will overflow uint112, so rather than having the update fail, we set the observation liquitities
        // to the max supported value.
        const totalTokenLiquidity = BigNumber.from(2).pow(112).sub(1);
        const totalQuoteTokenLiquidity = BigNumber.from(2).pow(112).sub(1);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx, "Update log")
            .to.emit(oracle, "Updated")
            .withArgs(token, price, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 2);

        expect(await underlyingOracle1.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );
        expect(await underlyingOracle2.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice, "Observation price").to.equal(price);
        expect(oTokenLiquidity, "Observation token liquidity").to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp, "Observation timestamp").to.equal(timestamp);
    });

    it("Should update successfully w/ same prices and liquidities", async () => {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle1.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await underlyingOracle2.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const totalTokenLiquidity = tokenLiquidity.mul(2);
        const totalQuoteTokenLiquidity = quoteTokenLiquidity.mul(2);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, price, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 2);

        expect(await underlyingOracle1.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );
        expect(await underlyingOracle2.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Should update successfully w/ differing prices and liquidities", async () => {
        const price1 = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity1 = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity1 = ethers.utils.parseUnits("1", 18);

        const price2 = ethers.utils.parseUnits("2", 18);
        const tokenLiquidity2 = ethers.utils.parseUnits("1000", 18);
        const quoteTokenLiquidity2 = ethers.utils.parseUnits("2000", 18);

        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle1.stubSetObservation(
            token,
            price1,
            tokenLiquidity1,
            quoteTokenLiquidity1,
            await currentBlockTimestamp()
        );

        await underlyingOracle2.stubSetObservation(
            token,
            price2,
            tokenLiquidity2,
            quoteTokenLiquidity2,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const totalTokenLiquidity = tokenLiquidity1.add(tokenLiquidity2);
        const totalQuoteTokenLiquidity = quoteTokenLiquidity1.add(quoteTokenLiquidity2);

        // = ~1.99 => looks good
        const expectedPrice = harmonicMean([price1, price2], [quoteTokenLiquidity1, quoteTokenLiquidity2]);

        const updateTx = await oracle.update(ethers.utils.hexZeroPad(token, 32));

        await expect(updateTx)
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        await expect(updateTx).to.emit(oracle, "AggregationPerformed").withArgs(token, timestamp, 2);

        expect(await underlyingOracle1.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );
        expect(await underlyingOracle2.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(expectedPrice);
        expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("CurrentAggregatorOracle#minimumResponses", function () {
    var oracle;
    var underlyingOracle;

    const quoteToken = USDC;
    const token = GRT;

    beforeEach(async function () {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        await underlyingOracle.stubSetLiquidityDecimals(6);

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 6,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should return the default (1)", async function () {
        expect(await oracle.minimumResponses(token)).to.equal(BigNumber.from(1));
    });

    it("Should return 22 when set", async function () {
        await oracle.overrideMinimumResponses(true, 22);
        expect(await oracle.minimumResponses(token)).to.equal(BigNumber.from(22));
    });
});

describe("CurrentAggregatorOracle#maximumResponseAge", function () {
    var oracle;
    var underlyingOracle;

    const quoteToken = USDC;
    const token = GRT;

    beforeEach(async function () {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        await underlyingOracle.stubSetLiquidityDecimals(6);

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 6,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should return the default (heartbeat + 30 minutes)", async function () {
        const expected = DEFAULT_HEARTBEAT + 30 * 60;
        expect(await oracle.maximumResponseAge(token)).to.equal(expected);
    });
});

describe("CurrentAggregatorOracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("CurrentAggregatorOracleStub");
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IOracleAggregator", async () => {
        const interfaceId = await interfaceIds.iOracleAggregator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IOracle", async () => {
        const interfaceId = await interfaceIds.iOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IPriceOracle", async () => {
        const interfaceId = await interfaceIds.iPriceOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support ILiquidityOracle", async () => {
        const interfaceId = await interfaceIds.iLiquidityOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IQuoteToken", async () => {
        const interfaceId = await interfaceIds.iQuoteToken();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IUpdateable", async () => {
        const interfaceId = await interfaceIds.iUpdateable();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHistoricalOracle", async () => {
        const interfaceId = await interfaceIds.iHistoricalOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IAccumulator", async () => {
        const interfaceId = await interfaceIds.iAccumulator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
