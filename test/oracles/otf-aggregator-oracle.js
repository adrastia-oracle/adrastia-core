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

const DEFAULT_MIN_FRESHNESS = 60 * 60; // 1 hour
const DEFAULT_MIN_RESPONSES = 1; // At least 1 response from the underlying oracles

const MINIMUM_TOKEN_LIQUIDITY_VALUE = BigNumber.from(0);
const MINIMUM_QUOTE_TOKEN_LIQUIDITY = BigNumber.from(0);
const MINIMUM_LIQUIDITY_RATIO = 1000; // 1:10 value(token):value(quoteToken)
const MAXIMUM_LIQUIDITY_RATIO = 100000; // 10:1 value(token):value(quoteToken)

const AGGREGATION_TIMESTAMP_STRATEGY_LATESTOBSERVATION = 2;

const DEFAULT_AGGREGATION_TIMESTAMP_STRATEGY = AGGREGATION_TIMESTAMP_STRATEGY_LATESTOBSERVATION;

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
        const aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator2");
        const aggregationStrategy = await aggregationStrategyFactory.deploy(DEFAULT_AGGREGATION_TIMESTAMP_STRATEGY);
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

    const minimumFreshness = params.minimumFreshness || DEFAULT_MIN_FRESHNESS;
    const minimumResponses = params.minimumResponses || DEFAULT_MIN_RESPONSES;

    delete params.minimumFreshness;
    delete params.minimumResponses;

    return await factory.deploy(params, minimumFreshness, minimumResponses);
}

describe("OtfAggregatorOracle#constructor", async function () {
    var underlyingOracleFactory;
    var oracleFactory;
    var aggregationStrategyFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");
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
        const minimumFreshness = DEFAULT_MIN_FRESHNESS;
        const minimumResponses = DEFAULT_MIN_RESPONSES;

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
            minimumFreshness,
            minimumResponses
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
        expect(await oracle.maximumResponseAge(BAT)).to.equal(minimumFreshness);
        expect(await oracle.minimumResponses(BAT)).to.equal(minimumResponses);

        expect(await oracle.getOracles(grtOracle.token)).to.eql(grtOracles);
    });

    it("Should deploy correctly with alternative valid arguments", async function () {
        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        const oracle2 = await underlyingOracleFactory.deploy(USDC);
        await oracle2.deployed();

        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const validationStrategyAddress = AddressZero;
        const quoteTokenName = "USD Coin";
        const quoteTokenAddress = USDC;
        const quoteTokenSymbol = "USDC";
        const quoteTokenDecimals = 0;
        const liquidityDecimals = 0;
        const oracles = [oracle1.address, oracle2.address];
        const tokenSpecificOracles = [];
        const minimumFreshness = DEFAULT_MIN_FRESHNESS * 2;
        const minimumResponses = DEFAULT_MIN_RESPONSES + 1;

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
            minimumFreshness,
            minimumResponses
        );

        const generalOracles = [
            [oracle1.address, await oracle1.quoteTokenDecimals(), await oracle1.liquidityDecimals()],
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
        expect(await oracle.maximumResponseAge(BAT)).to.equal(minimumFreshness);
        expect(await oracle.minimumResponses(BAT)).to.equal(minimumResponses);
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
                DEFAULT_MIN_FRESHNESS,
                DEFAULT_MIN_RESPONSES
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
                DEFAULT_MIN_FRESHNESS,
                DEFAULT_MIN_RESPONSES
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
                DEFAULT_MIN_FRESHNESS,
                DEFAULT_MIN_RESPONSES
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
                DEFAULT_MIN_FRESHNESS,
                DEFAULT_MIN_RESPONSES
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: DUPLICATE_ORACLE");
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
                DEFAULT_MIN_FRESHNESS,
                DEFAULT_MIN_RESPONSES
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: QUOTE_TOKEN_DECIMALS_MISMATCH");
    });

    it("Should revert if the minimum freshness is zero", async function () {
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
                0, // minimum freshness
                DEFAULT_MIN_RESPONSES
            )
        ).to.be.revertedWith("InvalidMinimumFreshness");
    });

    it("Should revert if the minimum responses is zero", async function () {
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
                DEFAULT_MIN_FRESHNESS,
                0 // minimum responses
            )
        ).to.be.revertedWith("InvalidMinimumResponses");
    });
});

describe("OtfAggregatorOracle#needsUpdate", function () {
    var oracle;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        // Push an underlying observation for GRT, so that aggregation works
        const updateTime = await currentBlockTimestamp();
        await underlyingOracle.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            updateTime
        );
    });

    it("Should return false", async function () {
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });
});

describe("OtfAggregatorOracle#canUpdate", function () {
    var oracle;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");
        const validationStrategyFactory = await ethers.getContractFactory("ValidationStub");

        const validationStrategy = await validationStrategyFactory.deploy();
        await validationStrategy.deployed();
        await validationStrategy.stubSetQuoteTokenDecimals(DEFAULT_AGGREGATOR_CONSTRUCTOR_PARAMS.quoteTokenDecimals);

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            validationStrategy: validationStrategy.address,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        // Push an underlying observation for GRT, so that aggregation works
        updateTime = await currentBlockTimestamp();
        await underlyingOracle.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            updateTime
        );
    });

    it("Should return false", async function () {
        expect(await oracle.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });
});

describe("OtfAggregatorOracle#consultPrice(token)", function () {
    var oracle;
    var underlyingOracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultPrice(address)"](GRT)).to.be.revertedWith(
            "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
        );
    });

    it("Should revert when the underlying observation is expired", async () => {
        await hre.timeAndMine.setTimeIncrease(1);

        // On the bounds of the freshness (not expired yet)
        const updateTime = (await currentBlockTimestamp()) - DEFAULT_MIN_FRESHNESS;

        // This will cause time to increase by 1 second, thus making the observation expired
        await underlyingOracle.stubSetObservation(
            GRT,
            LOWEST_ACCEPTABLE_PRICE,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            updateTime
        );

        await expect(oracle["consultPrice(address)"](GRT)).to.be.revertedWith(
            "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
        );
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const price = LOWEST_ACCEPTABLE_PRICE;

        const updateTime = (await currentBlockTimestamp()) - 10;

        await underlyingOracle.stubSetObservation(
            GRT,
            price,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            updateTime
        );

        expect(await oracle["consultPrice(address)"](GRT)).to.equal(price);
    });

    it("Should get the set price (=1e18)", async () => {
        const price = BigNumber.from(10).pow(18);

        const updateTime = (await currentBlockTimestamp()) - 10;

        await underlyingOracle.stubSetObservation(
            GRT,
            price,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            updateTime
        );

        expect(await oracle["consultPrice(address)"](GRT)).to.equal(price);
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const price = await oracle["consultPrice(address)"](await oracle.quoteTokenAddress());

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
    });
});

describe("OtfAggregatorOracle#consultPrice(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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

    it("Should get the set price (=1e18)", async () => {
        const price = BigNumber.from(10).pow(18);

        await underlyingOracle.stubSetInstantRates(
            GRT,
            price,
            LOWEST_ACCEPTABLE_LIQUIDITY,
            LOWEST_ACCEPTABLE_LIQUIDITY
        );

        expect(await oracle["consultPrice(address,uint256)"](GRT, 0)).to.equal(price);
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const price = await oracle["consultPrice(address,uint256)"](await oracle.quoteTokenAddress(), 0);

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
    });
});

describe("OtfAggregatorOracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;
    var underlyingOracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
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
            "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        await oracle["consultPrice(address)"](GRT);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const observationTime = await currentBlockTimestamp();
        const price = LOWEST_ACCEPTABLE_PRICE;

        await underlyingOracle.stubSetObservation(
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

        await underlyingOracle.stubSetObservation(
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

describe("OtfAggregatorOracle#consultLiquidity(token)", function () {
    var oracle;
    var underlyingOracle;

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
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address)"](GRT)).to.be.revertedWith(
            "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
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

            await underlyingOracle.stubSetObservation(
                GRT,
                _price,
                _tokenLiqudity,
                _quoteTokenLiquidity,
                observationTime
            );

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](GRT);

            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("OtfAggregatorOracle#consultLiquidity(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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

describe("OtfAggregatorOracle#consultLiquidity(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;
    var underlyingOracle;

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
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
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
            "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

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

            await underlyingOracle.stubSetObservation(
                GRT,
                _price,
                _tokenLiqudity,
                _quoteTokenLiquidity,
                observationTime
            );

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
                GRT,
                MAX_AGE
            );

            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("OtfAggregatorOracle#consult(token)", function () {
    describe("Standard consultation tests", function () {
        var oracle;
        var underlyingOracle;

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
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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

        it("Should revert when there's no observation", async () => {
            await expect(oracle["consult(address)"](GRT)).to.be.revertedWith(
                "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
            );
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

                await underlyingOracle.stubSetObservation(
                    GRT,
                    _price,
                    _tokenLiqudity,
                    _quoteTokenLiquidity,
                    observationTime
                );

                const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address)"](GRT);

                expect(price).to.equal(_price);
                expect(tokenLiqudity).to.equal(_tokenLiqudity);
                expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
            });
        });
    });

    describe("Aggregation tests w/ 1 underlying oracle", function () {
        const quoteToken = USDC;
        const token = GRT;

        var underlyingOracle;

        var oracle;

        beforeEach(async () => {
            // Time increases by 1 second with each block mined
            await hre.timeAndMine.setTimeIncrease(1);

            const mockOracleFactory = await ethers.getContractFactory("MockOracle");
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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

        it("Works", async () => {
            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(price);
            expect(oTokenLiquidity).to.equal(tokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });

        it("Works with a very high price and the lowest possible liquidity", async () => {
            // Note: 2^112-1 as the price gets rounded to 2^112 when calculating the harmonic mean (loss of precision).
            // This can't fit inside a uint112 and SafeCast will throw.
            const price = BigNumber.from(2).pow(111);
            const tokenLiquidity = LOWEST_ACCEPTABLE_LIQUIDITY;
            const quoteTokenLiquidity = LOWEST_ACCEPTABLE_LIQUIDITY;
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(price);
            expect(oTokenLiquidity).to.equal(tokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });

        it("Has correct price when the oracle has delta +2 quote token decimals", async function () {
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

            const constructorOverrides = {
                validationStrategy: AddressZero,
                quoteTokenName: "USD Coin",
                quoteTokenAddress: quoteToken,
                quoteTokenSymbol: "USDC",
                quoteTokenDecimals: 8, // Underlying has 6 decimals, so we set 8 here
                liquidityDecimals: 6,
                oracles: [underlyingOracle.address],
            };

            oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            // Increase by 2 decimal places (delta from underlying is +2), so multiply by 10^2
            const expectedPrice = price.mul(100);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(expectedPrice);
            expect(oTokenLiquidity).to.equal(tokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });

        it("Has correct price when the oracle has delta -2 quote token decimals", async function () {
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

            const constructorOverrides = {
                validationStrategy: AddressZero,
                quoteTokenName: "USD Coin",
                quoteTokenAddress: quoteToken,
                quoteTokenSymbol: "USDC",
                quoteTokenDecimals: 4, // Underlying has 6 decimals, so we set 4 here
                liquidityDecimals: 6,
                oracles: [underlyingOracle.address],
            };

            oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            // Decrease by 2 decimal places (delta from underlying is -2), so divide by 10^2
            const expectedPrice = price.div(100);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(expectedPrice);
            expect(oTokenLiquidity).to.equal(tokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });

        it("Has correct liquidity when the oracle has delta +2 liquidity decimals", async function () {
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

            const constructorOverrides = {
                validationStrategy: AddressZero,
                quoteTokenName: "USD Coin",
                quoteTokenAddress: quoteToken,
                quoteTokenSymbol: "USDC",
                quoteTokenDecimals: 6,
                liquidityDecimals: 8, // Underlying has 6 decimals, so we set 8 here
                oracles: [underlyingOracle.address],
            };

            oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            // Increase by 2 decimal places (delta from underlying is +2), so multiply by 10^2
            const expectedTokenLiquidity = tokenLiquidity.mul(100);
            const expectedQuoteTokenLiquidity = quoteTokenLiquidity.mul(100);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(price);
            expect(oTokenLiquidity).to.equal(expectedTokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });

        it("Has correct liquidity when the oracle has delta -2 liquidity decimals", async function () {
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

            const constructorOverrides = {
                validationStrategy: AddressZero,
                quoteTokenName: "USD Coin",
                quoteTokenAddress: quoteToken,
                quoteTokenSymbol: "USDC",
                quoteTokenDecimals: 6,
                liquidityDecimals: 4, // Underlying has 6 decimals, so we set 4 here
                oracles: [underlyingOracle.address],
            };

            oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            // Decrease by 2 decimal places (delta from underlying is -2), so divide by 10^2
            const expectedTokenLiquidity = tokenLiquidity.div(100);
            const expectedQuoteTokenLiquidity = quoteTokenLiquidity.div(100);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(price);
            expect(oTokenLiquidity).to.equal(expectedTokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });

        it("Shouldn't use old rates", async () => {
            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);

            // Setting the observation below will increase the time past the threshold
            const timestamp = (await currentBlockTimestamp()) - DEFAULT_MIN_FRESHNESS;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            await expect(oracle.getLatestObservation(token)).to.be.revertedWith(
                "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
            );
        });

        it("Should catch underlying consult errors and revert", async () => {
            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
                token
            );

            // Sanity check that the oracle has a valid observation
            expect(poPrice).to.equal(price);
            expect(poTokenLiquidity).to.equal(tokenLiquidity);
            expect(poQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
            expect(poTimestamp).to.equal(timestamp);

            // Now set the underlying oracle to return an error
            await underlyingOracle.stubSetConsultError(true);

            await expect(oracle.getLatestObservation(token)).to.be.revertedWith(
                "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
            );
        });

        it("Should revert when there aren't any valid consultations", async () => {
            await expect(oracle.getLatestObservation(token)).to.be.revertedWith(
                "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
            );
        });

        it("Should revert when the underlying oracle's price is 0", async () => {
            // Deploy the aggregator with the default validation strategy
            const constructorOverrides = {
                quoteTokenName: "USD Coin",
                quoteTokenAddress: quoteToken,
                quoteTokenSymbol: "USDC",
                quoteTokenDecimals: 6,
                liquidityDecimals: 6,
                oracles: [underlyingOracle.address],
            };
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");
            oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            const price = BigNumber.from(0);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            await expect(oracle.getLatestObservation(token)).to.be.revertedWith(
                "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
            );
        });

        it("Should revert when the underlying oracle's quote token liquidity is 0", async () => {
            // Deploy the aggregator with the default validation strategy
            const constructorOverrides = {
                quoteTokenName: "USD Coin",
                quoteTokenAddress: quoteToken,
                quoteTokenSymbol: "USDC",
                quoteTokenDecimals: 6,
                liquidityDecimals: 6,
                oracles: [underlyingOracle.address],
            };
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");
            oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = BigNumber.from(0);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            await expect(oracle.getLatestObservation(token)).to.be.revertedWith(
                "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
            );
        });

        it("Should revert when the underlying oracle's price and quote token liquidity is 0", async () => {
            // Deploy the aggregator with the default validation strategy
            const constructorOverrides = {
                quoteTokenName: "USD Coin",
                quoteTokenAddress: quoteToken,
                quoteTokenSymbol: "USDC",
                quoteTokenDecimals: 6,
                liquidityDecimals: 6,
                oracles: [underlyingOracle.address],
            };
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");
            oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            const price = BigNumber.from(0);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = BigNumber.from(0);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            await expect(oracle.getLatestObservation(token)).to.be.revertedWith(
                "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
            );
        });
    });

    describe("Aggregation tests w/ 2 underlying oracle", function () {
        const quoteToken = USDC;
        const token = GRT;

        var underlyingOracle1;
        var underlyingOracle2;

        var oracle;

        beforeEach(async () => {
            // Time increases by 1 second with each block mined
            await hre.timeAndMine.setTimeIncrease(1);

            const mockOracleFactory = await ethers.getContractFactory("MockOracle");
            const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle1.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            await underlyingOracle2.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            // Liquitities will overflow uint112, so rather than having the update fail, we set the observation liquitities
            // to the max supported value.
            const totalTokenLiquidity = BigNumber.from(2).pow(112).sub(1);
            const totalQuoteTokenLiquidity = BigNumber.from(2).pow(112).sub(1);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice, "Observation price").to.equal(price);
            expect(oTokenLiquidity, "Observation token liquidity").to.equal(totalTokenLiquidity);
            expect(oQuoteTokenLiquidity, "Observation quote token liquidity").to.equal(totalQuoteTokenLiquidity);
            expect(oTimestamp, "Observation timestamp").to.equal(timestamp);
        });

        it("Should work successfully w/ same prices and liquidities", async () => {
            const price = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle1.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            await underlyingOracle2.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

            const totalTokenLiquidity = tokenLiquidity.mul(2);
            const totalQuoteTokenLiquidity = quoteTokenLiquidity.mul(2);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(price);
            expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });

        it("Should work successfully w/ differing prices and liquidities", async () => {
            const price1 = ethers.utils.parseUnits("1", 18);
            const tokenLiquidity1 = ethers.utils.parseUnits("1", 18);
            const quoteTokenLiquidity1 = ethers.utils.parseUnits("1", 18);

            const price2 = ethers.utils.parseUnits("2", 18);
            const tokenLiquidity2 = ethers.utils.parseUnits("1000", 18);
            const quoteTokenLiquidity2 = ethers.utils.parseUnits("2000", 18);

            const timestamp = (await currentBlockTimestamp()) - 10;

            await underlyingOracle1.stubSetObservation(token, price1, tokenLiquidity1, quoteTokenLiquidity1, timestamp);

            await underlyingOracle2.stubSetObservation(token, price2, tokenLiquidity2, quoteTokenLiquidity2, timestamp);

            const totalTokenLiquidity = tokenLiquidity1.add(tokenLiquidity2);
            const totalQuoteTokenLiquidity = quoteTokenLiquidity1.add(quoteTokenLiquidity2);

            // = ~1.99 => looks good
            const expectedPrice = harmonicMean([price1, price2], [quoteTokenLiquidity1, quoteTokenLiquidity2]);

            const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(
                token
            );

            expect(oPrice).to.equal(expectedPrice);
            expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
            expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
            expect(oTimestamp).to.equal(timestamp);
        });
    });
});

describe("OtfAggregatorOracle#consult(token, maxAge = 0)", function () {
    var oracleFactory;
    var mockOracleFactory;
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        mockOracleFactory = await ethers.getContractFactory("MockOracle");
        oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

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

describe("OtfAggregatorOracle#consult(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;
    var underlyingOracle;

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
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
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
            "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](GRT, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

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

            await underlyingOracle.stubSetObservation(
                GRT,
                _price,
                _tokenLiqudity,
                _quoteTokenLiquidity,
                observationTime
            );

            const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address,uint256)"](GRT, MAX_AGE);

            expect(price).to.equal(_price);
            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
    });
});

describe("OtfAggregatorOracle#update", function () {
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Reverts called", async () => {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        await expect(oracle.update(updateData)).to.be.revertedWith("Not supported");
    });
});

describe("OtfAggregatorOracle - IHistoricalOracle implementation", function () {
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Reverts when getObservationAt is called", async () => {
        await expect(oracle.getObservationAt(GRT, 0)).to.be.revertedWith("Not supported");
    });

    it("Reverts when getObservations(address,uint256) is called", async () => {
        await expect(oracle["getObservations(address,uint256)"](GRT, 0)).to.be.revertedWith("Not supported");
    });

    it("Reverts when getObservations(address,uint256,uint256,uint256) is called", async () => {
        await expect(oracle["getObservations(address,uint256,uint256,uint256)"](GRT, 0, 0, 0)).to.be.revertedWith(
            "Not supported"
        );
    });

    it("Reverts when getObservationsCount is called", async () => {
        await expect(oracle.getObservationsCount(GRT)).to.be.revertedWith("Not supported");
    });

    it("Reverts when getObservationsCapacity is called", async () => {
        await expect(oracle.getObservationsCapacity(GRT)).to.be.revertedWith("Not supported");
    });

    it("Reverts when setObservationsCapacity is called", async () => {
        await expect(oracle.setObservationsCapacity(GRT, 100)).to.be.revertedWith("Not supported");
    });
});

describe("OtfAggregatorOracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("OtfAggregatorOracle");
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

    it("Doesn't support IUpdateable", async () => {
        const interfaceId = await interfaceIds.iUpdateable();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(false);
    });

    it("Doesn't support IHistoricalOracle", async () => {
        const interfaceId = await interfaceIds.iHistoricalOracle();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(false);
    });
});
