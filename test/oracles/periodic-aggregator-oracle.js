const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const BAT = "0x0D8775F648430679A709E98d2b0Cb6250d2887EF";

const PERIOD = 100;
const GRANULARITY = 1;
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
    period: PERIOD,
    granularity: GRANULARITY,
};

// Credits: https://stackoverflow.com/questions/53311809/all-possible-combinations-of-a-2d-array-in-javascript
function combos(list, n = 0, result = [], current = []) {
    if (n === list.length) result.push(current);
    else list[n].forEach((item) => combos(list, n + 1, result, [...current, item]));

    return result;
}

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

    const period = params.period;
    const granularity = params.granularity;

    delete params.period;
    delete params.granularity;

    return await factory.deploy(params, period, granularity);
}

describe("PeriodicAggregatorOracle#constructor", async function () {
    var underlyingOracleFactory;
    var oracleFactory;
    var aggregationStrategyFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracle");
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
        const period = 30;
        const granularity = 5;

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
            period,
            granularity
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
        expect(await oracle.period()).to.equal(period);
        expect(await oracle.granularity()).to.equal(granularity);

        expect(await oracle.getOracles(grtOracle.token)).to.eql(grtOracles);
    });

    it("Should revert if no underlying oracles are provided", async () => {
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
                PERIOD,
                GRANULARITY
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: MISSING_ORACLES");
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
                PERIOD,
                GRANULARITY
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
                PERIOD,
                GRANULARITY
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
                PERIOD,
                GRANULARITY
            )
        ).to.be.revertedWith("AbstractAggregatorOracle: DUPLICATE_ORACLE");
    });

    it("Should revert if the period is 0", async function () {
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
                0,
                GRANULARITY
            )
        ).to.be.revertedWith("PeriodicAggregatorOracle: INVALID_PERIOD");
    });

    it("Should revert if the granularity is 0", async function () {
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
                PERIOD,
                0
            )
        ).to.be.revertedWith("PeriodicAggregatorOracle: INVALID_GRANULARITY");
    });

    it("Should revert if period is not a multiple of granularity", async function () {
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
                3,
                2
            )
        ).to.be.revertedWith("PeriodicAggregatorOracle: INVALID_PERIOD_GRANULARITY");
    });
});

describe("PeriodicAggregatorOracle#needsUpdate", function () {
    var oracle;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should require an update if no observations have been made", async () => {
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
    });

    it("Should require an update if deltaTime == period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
    });

    it("Should require an update if deltaTime > period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD + 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD + 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
    });

    it("Shouldm't require an update if deltaTime < period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD - 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD - 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });

    it("Shouldm't require an update if deltaTime == 0", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(GRT, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime);

        expect(await currentBlockTimestamp()).to.equal(observationTime);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(false);
    });
});

describe("PeriodicAggregatorOracle#canUpdate", function () {
    var oracle;
    var validationStrategy;

    var underlyingOracle1;
    var underlyingOracle2;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");
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

        it("An underlying oracle needs an update", async function () {
            await underlyingOracle1.stubSetNeedsUpdate(true);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(GRT, 32))).to.equal(true);
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

describe("PeriodicAggregatorOracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consultPrice(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consultLiquidity(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consultLiquidity(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consultLiquidity(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consult(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consult(token, maxAge = 0)", function () {
    var oracleFactory;
    var mockOracleFactory;
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        mockOracleFactory = await ethers.getContractFactory("MockOracle");
        oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#consult(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

describe("PeriodicAggregatorOracle#update w/ 1 underlying oracle", function () {
    const quoteToken = USDC;
    const token = GRT;

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, tokenLiquidity, quoteTokenLiquidity, timestamp);

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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, tokenLiquidity, quoteTokenLiquidity, timestamp);

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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, expectedTokenLiquidity, expectedQuoteTokenLiquidity, timestamp);

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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, expectedTokenLiquidity, expectedQuoteTokenLiquidity, timestamp);

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
        const timestamp = (await currentBlockTimestamp()) + PERIOD * 2 + 1;

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
            BigNumber.from(1)
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

        // Should only return true if one of the underlying oracles is updated
        await underlyingOracle.stubSetUpdateReturn(true);
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(true);
        await underlyingOracle.stubSetUpdateReturn(false);
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
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Should catch underlying update errors and update", async () => {
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

        await underlyingOracle.stubSetUpdateError(true);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateError")
            .withArgs(
                underlyingOracle.address,
                token,
                "0x4e487b710000000000000000000000000000000000000000000000000000000000000011"
            );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Should catch underlying update errors (w/ reason) and update", async () => {
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

        await underlyingOracle.stubSetUpdateErrorWithReason(true);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(underlyingOracle.address, token, "REASON");

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
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
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price is 0", async () => {
        const price = BigNumber.from(0);
        const tokenLiquidity = ethers.utils.parseUnits("2", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("2", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTime(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's token liquidity is 0", async () => {
        const price = ethers.utils.parseUnits("2", 18);
        const tokenLiquidity = BigNumber.from(0);
        const quoteTokenLiquidity = ethers.utils.parseUnits("2", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTime(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's quote token liquidity is 0", async () => {
        const price = ethers.utils.parseUnits("2", 18);
        const tokenLiquidity = ethers.utils.parseUnits("2", 18);
        const quoteTokenLiquidity = BigNumber.from(0);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTime(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price and quote token liquidity is 0", async () => {
        const price = BigNumber.from(0);
        const tokenLiquidity = ethers.utils.parseUnits("2", 18);
        const quoteTokenLiquidity = BigNumber.from(0);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTime(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price and token liquidity is 0", async () => {
        const price = BigNumber.from(0);
        const tokenLiquidity = BigNumber.from(0);
        const quoteTokenLiquidity = ethers.utils.parseUnits("2", 18);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTime(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price, token liquidity, and quote token liquidity is 0", async () => {
        const price = BigNumber.from(0);
        const tokenLiquidity = BigNumber.from(0);
        const quoteTokenLiquidity = BigNumber.from(0);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.getLatestObservation(
            token
        );

        await hre.timeAndMine.setTime(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AbstractAggregatorOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the period hasn't been passed", async () => {
        const observationTime = await currentBlockTimestamp();
        const checkTime = observationTime + PERIOD - 2;

        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, checkTime);
        await oracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Fast forward to the check time
        await hre.timeAndMine.setTime(checkTime);

        // Check that update returns false
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(false);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that no event was emitted
        expect(receipt.events).to.be.empty;

        // Expect that the last update time hasn't changed
        expect(await oracle.lastUpdateTime(ethers.utils.hexZeroPad(token, 32))).to.equal(observationTime);
    });

    it("Should update when the period has been passed", async () => {
        const observationTime = await currentBlockTimestamp();
        const checkTime = observationTime + PERIOD + 2;

        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("3", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("5", 18);

        await underlyingOracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, checkTime);
        await oracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);

        // Fast forward to the check time
        await hre.timeAndMine.setTime(checkTime);

        // Check that update returns true
        expect(await oracle.callStatic.update(ethers.utils.hexZeroPad(token, 32))).to.equal(true);

        const tx = await oracle.update(ethers.utils.hexZeroPad(token, 32));
        const receipt = await tx.wait();

        // Expect that `Updated` was emitted
        expect(receipt)
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, observationTime);

        const updateTime = await blockTimestamp(receipt.blockNumber);

        // Expect that the new observation is what we expect
        expect(await oracle.getLatestObservation(token)).to.deep.equal([
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            updateTime,
        ]);
    });
});

describe("PeriodicAggregatorOracle#update w/ 2 underlying oracle", function () {
    const quoteToken = USDC;
    const token = GRT;

    var underlyingOracle1;
    var underlyingOracle2;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)), "Update log")
            .to.emit(oracle, "Updated")
            .withArgs(token, price, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        expect(await underlyingOracle1.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );
        expect(await underlyingOracle2.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        expect(await underlyingOracle1.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );
        expect(await underlyingOracle2.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
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

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        expect(await underlyingOracle1.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );
        expect(await underlyingOracle2.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(expectedPrice);
        expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("PeriodicAggregatorOracle#update w/ 1 general underlying oracle and one token specific oracle", function () {
    const quoteToken = USDC;
    var token = GRT;

    var underlyingOracle;
    var tokenSpecificOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        tokenSpecificOracle = await mockOracleFactory.deploy(quoteToken);
        await tokenSpecificOracle.deployed();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 0,
            oracles: [underlyingOracle.address],
            tokenSpecificOracles: [
                {
                    token: GRT,
                    oracle: tokenSpecificOracle.address,
                },
            ],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    it("Should call update on both the general oracle and the token specific oracle (underlying)", async () => {
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

        await tokenSpecificOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const totalTokenLiquidity = tokenLiquidity.mul(2);
        const totalQuoteTokenLiquidity = quoteTokenLiquidity.mul(2);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );
        expect(await tokenSpecificOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Should call update on only the general oracle (underlying)", async () => {
        token = BAT; // Not covered by the token specific oracle

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

        await tokenSpecificOracle.stubSetObservation(
            token,
            ethers.utils.parseUnits("3", 18),
            ethers.utils.parseUnits("30", 18),
            ethers.utils.parseUnits("30", 18),
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );
        expect(await tokenSpecificOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(0)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("PeriodicAggregatorOracle#update w/ 1 underlying oracle and a minimum token liquidity value", function () {
    const quoteToken = USDC;
    const token = GRT;
    const tokenDecimals = 18;

    const minimumTokenLiquidityValue = BigNumber.from(10); // 10 USDC worth
    const minimumQuoteTokenLiquidity = BigNumber.from(0);

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const aggregationStrategyFactory = await ethers.getContractFactory("DefaultAggregator");
        const aggregationStrategy = await aggregationStrategyFactory.deploy();
        await aggregationStrategy.deployed();

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 0,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(
            oracleFactory,
            constructorOverrides,
            minimumTokenLiquidityValue,
            minimumQuoteTokenLiquidity
        );

        const validationStrategyAddress = await oracle.validationStrategy(token);
        const validationStrategy = await ethers.getContractAt("DefaultValidationStub", validationStrategyAddress);

        await validationStrategy.overrideValidateUnderlyingConsultation(false, false);
        await validationStrategy.overrideSanityCheckTvlDistributionRatio(true, true);
        await validationStrategy.overrideSanityCheckQuoteTokenLiquidity(true, true);
    });

    it("Shouldn't update when the underlying oracle has less token liquidity value than the minimum", async () => {
        const price = ethers.utils.parseUnits("0.9", 6);
        const tokenLiquidity = BigNumber.from(10); // 10 whole tokens worth 9 USDC
        const quoteTokenLiquidity = BigNumber.from(10);
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
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Should update successfully when the underlying oracle has the minimum token liquidity value", async () => {
        const price = ethers.utils.parseUnits("1.0", 6);
        const tokenLiquidity = BigNumber.from(10); // 10 whole tokens worth 10 USDC
        const quoteTokenLiquidity = BigNumber.from(10);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("PeriodicAggregatorOracle#update w/ 1 underlying oracle and a minimum quote token liquidity", function () {
    const quoteToken = USDC;
    const token = GRT;
    const tokenDecimals = 18;

    const minimumTokenLiquidityValue = BigNumber.from(0);
    const minimumQuoteTokenLiquidity = BigNumber.from(10); // 10 USDC

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 0,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(
            oracleFactory,
            constructorOverrides,
            minimumTokenLiquidityValue,
            minimumQuoteTokenLiquidity
        );

        const validationStrategyAddress = await oracle.validationStrategy(token);
        const validationStrategy = await ethers.getContractAt("DefaultValidationStub", validationStrategyAddress);

        await validationStrategy.overrideValidateUnderlyingConsultation(false, false);
        await validationStrategy.overrideSanityCheckTvlDistributionRatio(true, true);
        await validationStrategy.overrideSanityCheckTokenLiquidityValue(true, true);
    });

    it("Shouldn't update when the underlying oracle has less token quote token liquidity than the minimum", async () => {
        const price = ethers.utils.parseUnits("1.0", 6);
        const tokenLiquidity = BigNumber.from(10);
        const quoteTokenLiquidity = BigNumber.from(9); // 9 USDC
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
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Should update successfully when the underlying oracle has the minimum quote token liquidity", async () => {
        const price = ethers.utils.parseUnits("1.0", 6);
        const tokenLiquidity = BigNumber.from(10);
        const quoteTokenLiquidity = BigNumber.from(10); // 10 USDC
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("PeriodicAggregatorOracle#update w/ 1 underlying oracle and an allowed TVL distribution range", function () {
    const quoteToken = USDC;
    const token = GRT;
    const tokenDecimals = 18;

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 0,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        const validationStrategyAddress = await oracle.validationStrategy(token);
        const validationStrategy = await ethers.getContractAt("DefaultValidationStub", validationStrategyAddress);

        await validationStrategy.overrideValidateUnderlyingConsultation(false, false);
        await validationStrategy.overrideSanityCheckTokenLiquidityValue(true, true);
        await validationStrategy.overrideSanityCheckQuoteTokenLiquidity(true, true);
    });

    it("Shouldn't update when the underlying oracle has one-sided liquidity (100:1)", async () => {
        // tokenLiquidityValue:quoteTokenLiquidityValue = 100:1
        const price = ethers.utils.parseUnits("1.0", 6);
        const tokenLiquidity = BigNumber.from(1000);
        const quoteTokenLiquidity = BigNumber.from(10);
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
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Should update successfully when the underlying oracle has balanced liquidity (10:1)", async () => {
        // tokenLiquidityValue:quoteTokenLiquidityValue = 10:1
        const price = ethers.utils.parseUnits("1.0", 6);
        const tokenLiquidity = BigNumber.from(10);
        const quoteTokenLiquidity = BigNumber.from(100);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Should update successfully when the underlying oracle has balanced liquidity (1:1)", async () => {
        // tokenLiquidityValue:quoteTokenLiquidityValue = 1:1
        const price = ethers.utils.parseUnits("1.0", 6);
        const tokenLiquidity = BigNumber.from(10);
        const quoteTokenLiquidity = BigNumber.from(10);
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("PeriodicAggregatorOracle#update w/ 2 underlying oracles but one failing validation", function () {
    const quoteToken = USDC;
    const token = GRT;
    const tokenDecimals = 18;

    var underlyingOracle1;
    var underlyingOracle2;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        underlyingOracle1 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle1.deployed();

        underlyingOracle2 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle2.deployed();

        const constructorOverrides = {
            quoteTokenName: "USD Coin",
            quoteTokenAddress: quoteToken,
            quoteTokenSymbol: "USDC",
            quoteTokenDecimals: 6,
            liquidityDecimals: 0,
            oracles: [underlyingOracle1.address, underlyingOracle2.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        const validationStrategyAddress = await oracle.validationStrategy(token);
        const validationStrategy = await ethers.getContractAt("DefaultValidationStub", validationStrategyAddress);

        await validationStrategy.overrideValidateUnderlyingConsultation(false, false);
    });

    it("Should update successfully using only the data from the passing oracle", async () => {
        // tokenLiquidityValue:quoteTokenLiquidityValue = 1:1
        const price = ethers.utils.parseUnits("1.0", 6);
        const tokenLiquidity = LOWEST_ACCEPTABLE_LIQUIDITY;
        const quoteTokenLiquidity = LOWEST_ACCEPTABLE_LIQUIDITY;
        const timestamp = (await currentBlockTimestamp()) + 10;

        await underlyingOracle1.stubSetObservation(
            token,
            price,
            tokenLiquidity,
            quoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        // tokenLiquidityValue:quoteTokenLiquidityValue = 1000000000:1
        const badPrice = ethers.utils.parseUnits("10000000.0", 6);
        const badTokenLiquidity = ethers.utils.parseUnits("100", tokenDecimals);
        const badQuoteTokenLiquidity = ethers.utils.parseUnits("1.0", 6);

        await underlyingOracle2.stubSetObservation(
            token,
            badPrice,
            badTokenLiquidity,
            badQuoteTokenLiquidity,
            await currentBlockTimestamp()
        );

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        const totalTokenLiquidity = tokenLiquidity;
        const totalQuoteTokenLiquidity = quoteTokenLiquidity;

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, price, totalTokenLiquidity, totalQuoteTokenLiquidity, timestamp);

        expect(await underlyingOracle1.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );
        expect(await underlyingOracle2.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.getLatestObservation(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("PeriodicAggregatorOracle#calculateMaxAge", function () {
    var underlyingOracle;

    var oracleFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();
    });

    it("Shouldn't return 0 when period is 1", async function () {
        const constructorOverrides = {
            validationStrategy: AddressZero,
            oracles: [underlyingOracle.address],
            period: 1,
        };

        const oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

        expect(await oracle.stubCalculateMaxAge(GRT)).to.not.equal(0);
    });

    const periods = [2, 100, 1000, 10000];

    for (const period of periods) {
        it(`Should return ${period - 1} when period = ${period}`, async function () {
            const constructorOverrides = {
                validationStrategy: AddressZero,
                oracles: [underlyingOracle.address],
                period: period,
            };

            const oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);

            expect(await oracle.stubCalculateMaxAge(GRT)).to.equal(period - 1);
        });
    }
});

describe("PeriodicAggregatorOracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");
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

    it("Should support IPeriodic", async () => {
        const interfaceId = await interfaceIds.iPeriodic();
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
});

describe("PeriodicAggregatorOracle - IHistoricalOracle implementation", function () {
    var oracle;
    var underlyingOracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("PeriodicAggregatorOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        const constructorOverrides = {
            validationStrategy: AddressZero,
            oracles: [underlyingOracle.address],
        };

        oracle = await constructDefaultAggregator(oracleFactory, constructorOverrides);
    });

    describe("PeriodicAggregatorOracle#initializeBuffers", function () {
        it("Can't be called twice", async function () {
            await oracle.stubInitializeBuffers(GRT);

            await expect(oracle.stubInitializeBuffers(GRT)).to.be.revertedWith("BufferAlreadyInitialized");
        });

        it("Emits the correct event", async function () {
            await expect(oracle.stubInitializeBuffers(GRT))
                .to.emit(oracle, "ObservationCapacityInitialized")
                .withArgs(GRT, GRANULARITY);
        });
    });

    describe("PeriodicAggregatorOracle#setObservationCapacity", function () {
        it("Should revert if the amount is less than the existing capacity", async function () {
            await oracle.setObservationsCapacity(GRT, 4);

            await expect(oracle.setObservationsCapacity(GRT, 2)).to.be.revertedWith("CapacityCannotBeDecreased");
        });

        it("Should revert if the amount is 0", async function () {
            await expect(oracle.setObservationsCapacity(GRT, 0)).to.be.revertedWith("CapacityCannotBeDecreased");
        });

        it("Should revert if the amount is larger than the maximum capacity", async function () {
            await expect(oracle.setObservationsCapacity(GRT, 65536)).to.be.revertedWith("CapacityTooLarge");
        });

        it("Should emit an event when the capacity is changed", async function () {
            const amount = 20;

            const initialAmount = await oracle.getObservationsCapacity(GRT);

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan(initialAmount.toNumber());

            await expect(oracle.setObservationsCapacity(GRT, amount))
                .to.emit(oracle, "ObservationCapacityIncreased")
                .withArgs(GRT, initialAmount, amount);
        });

        it("Should not emit an event when the capacity is not changed (with default capacity)", async function () {
            const initialAmount = await oracle.getObservationsCapacity(GRT);

            await expect(oracle.setObservationsCapacity(GRT, initialAmount)).to.not.emit(
                oracle,
                "ObservationCapacityIncreased"
            );
        });

        it("Should not emit an event when the capacity is not changed (with non-default capacity)", async function () {
            const initialAmount = await oracle.getObservationsCapacity(GRT);
            const amount = 20;

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan(initialAmount.toNumber());

            await oracle.setObservationsCapacity(GRT, amount);

            // Sanity check that the capacity is now the new amount
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(amount);

            // Try again to set it to the same amount
            await expect(oracle.setObservationsCapacity(GRT, amount)).to.not.emit(
                oracle,
                "ObservationCapacityIncreased"
            );
        });

        it("Should update the capacity", async function () {
            const amount = 20;

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan((await oracle.getObservationsCapacity(GRT)).toNumber());

            await oracle.setObservationsCapacity(GRT, amount);

            expect(await oracle.getObservationsCapacity(GRT)).to.equal(amount);
        });

        it("Added capacity should not be filled until our latest observation is beside an uninitialized observation", async function () {
            const workingCapacity = 6;

            // Set the capacity to the working capacity
            await oracle.setObservationsCapacity(GRT, workingCapacity);

            // Push workingCapacity + 1 observations so that the buffer is full and the latest observation is at the start of the buffer
            for (let i = 0; i < workingCapacity + 1; ++i) {
                await oracle.stubPush(GRT, 1, 1, 1, 1);
            }

            // Sanity check that the buffer is full
            expect(await oracle.getObservationsCount(GRT)).to.equal(workingCapacity);

            // Increase the capacity by 1
            await oracle.setObservationsCapacity(GRT, workingCapacity + 1);

            // We should need to push workingCapacity observations before the new capacity is filled
            for (let i = 0; i < workingCapacity - 1; ++i) {
                await oracle.stubPush(GRT, 1, 1, 1, 1);

                // Sanity check that the buffer is still not full
                expect(await oracle.getObservationsCount(GRT)).to.equal(workingCapacity);
            }

            // Push one more observation. This should fill the new capacity
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            // Check that the buffer is now full
            expect(await oracle.getObservationsCount(GRT)).to.equal(workingCapacity + 1);
        });
    });

    describe("PeriodicAggregatorOracle#getObservationsCapacity", function () {
        it("Should return the default capacity when the buffer is uninitialized", async function () {
            const initialCapacity = await oracle.stubInitialCardinality();

            expect(await oracle.getObservationsCapacity(GRT)).to.equal(initialCapacity);
        });

        it("Should return the capacity when the buffer is initialized", async function () {
            await oracle.stubInitializeBuffers(GRT);

            const initialCapacity = await oracle.stubInitialCardinality();

            expect(await oracle.getObservationsCapacity(GRT)).to.equal(initialCapacity);
        });

        it("Should return the capacity after the buffer has been resized", async function () {
            const amount = 20;

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan((await oracle.getObservationsCapacity(GRT)).toNumber());

            await oracle.setObservationsCapacity(GRT, amount);

            expect(await oracle.getObservationsCapacity(GRT)).to.equal(amount);
        });
    });

    describe("PeriodicAggregatorOracle#getObservationsCount", function () {
        it("Should return 0 when the buffer is uninitialized", async function () {
            expect(await oracle.getObservationsCount(GRT)).to.equal(0);
        });

        it("Should return 0 when the buffer is initialized but empty", async function () {
            await oracle.stubInitializeBuffers(GRT);

            expect(await oracle.getObservationsCount(GRT)).to.equal(0);
        });

        it("Increasing capacity should not change the observations count", async function () {
            const initialAmount = 4;

            await oracle.setObservationsCapacity(GRT, initialAmount);

            // Push 2 observations
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            // Sanity check that the observations count is 2
            expect(await oracle.getObservationsCount(GRT)).to.equal(2);

            // Increase the capacity by 1
            await oracle.setObservationsCapacity(GRT, initialAmount + 1);

            // The observations count should still be 2
            expect(await oracle.getObservationsCount(GRT)).to.equal(2);
        });

        it("Should be limited by the capacity", async function () {
            const capacity = 6;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Push capacity + 1 observations
            for (let i = 0; i < capacity + 1; ++i) {
                await oracle.stubPush(GRT, 1, 1, 1, 1);
            }

            // The observations count should be limited by the capacity
            expect(await oracle.getObservationsCount(GRT)).to.equal(capacity);
        });
    });

    describe("PeriodicAggregatorOracle#getObservations(token, amount, offset, increment)", function () {
        it("Should return an empty array when amount is 0", async function () {
            // Push 1 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            const observations = await oracle["getObservations(address,uint256,uint256,uint256)"](GRT, 0, 0, 1);

            expect(observations.length).to.equal(0);
        });

        it("Should revert if the offset equals the number of observations", async function () {
            // Push 1 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(oracle["getObservations(address,uint256,uint256,uint256)"](GRT, 1, 1, 1)).to.be.revertedWith(
                "InsufficientData"
            );
        });

        it("Should revert if the offset equals the number of observations but is less than the capacity", async function () {
            const capacity = 6;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 1 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(oracle["getObservations(address,uint256,uint256,uint256)"](GRT, 1, 1, 1)).to.be.revertedWith(
                "InsufficientData"
            );
        });

        it("Should revert if the amount exceeds the number of observations", async function () {
            // Push 1 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(oracle["getObservations(address,uint256,uint256,uint256)"](GRT, 2, 0, 1)).to.be.revertedWith(
                "InsufficientData"
            );
        });

        it("Should revert if the amount exceeds the number of observations but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 1 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            // Sanity check that the amount to get is less than the capacity
            expect(amountToGet).to.be.lessThan(capacity);

            await expect(
                oracle["getObservations(address,uint256,uint256,uint256)"](GRT, amountToGet, 0, 1)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the amount and offset exceed the number of observations", async function () {
            const capacity = 2;
            const amountToGet = 2;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 2 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(
                oracle["getObservations(address,uint256,uint256,uint256)"](GRT, amountToGet, 1, 1)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the amount and offset exceed the number of observations but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 2 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(
                oracle["getObservations(address,uint256,uint256,uint256)"](GRT, amountToGet, 1, 1)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment and amount exceeds the number of observations", async function () {
            const capacity = 2;
            const amountToGet = 2;
            const offset = 0;
            const increment = 2;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 2 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(
                oracle["getObservations(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment and amount exceeds the number of observations but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;
            const offset = 0;
            const increment = 2;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 2 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(
                oracle["getObservations(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment, amount, and offset exceeds the number of observations", async function () {
            const capacity = 2;
            const amountToGet = 2;
            const offset = 1;
            const increment = 2;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 3 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(
                oracle["getObservations(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment, amount, and offset exceeds the number of observations but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;
            const offset = 1;
            const increment = 2;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 3 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 1, 1, 1, 1);

            await expect(
                oracle["getObservations(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should return the latest observation many times when increment is 0", async function () {
            const capacity = 2;
            const amountToGet = 2;
            const offset = 0;
            const increment = 0;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            // Push 2 observation
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 2, 2, 2, 2);

            const observations = await oracle["getObservations(address,uint256,uint256,uint256)"](
                GRT,
                amountToGet,
                offset,
                increment
            );

            expect(observations.length).to.equal(amountToGet);

            for (let i = 0; i < amountToGet; ++i) {
                expect(observations[i].price).to.equal(2);
                expect(observations[i].tokenLiquidity).to.equal(2);
                expect(observations[i].quoteTokenLiquidity).to.equal(2);
                expect(observations[i].timestamp).to.equal(2);
            }
        });

        async function pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush) {
            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            for (let i = 0; i < observationsToPush; i++) {
                await oracle.stubPush(GRT, i, i, i, i);
            }

            // Sanity check the count
            expect(await oracle.getObservationsCount(GRT)).to.equal(Math.min(observationsToPush, capacity));

            const observations = await oracle["getObservations(address,uint256,uint256,uint256)"](
                GRT,
                amountToGet,
                offset,
                increment
            );

            expect(observations.length).to.equal(amountToGet);

            for (let i = 0; i < amountToGet; ++i) {
                // The latest observation is at index 0 and will have the highest expected values
                // The following observations will have the expected values decrementing by 1
                const expected = observationsToPush - i * increment - 1 - offset;

                expect(observations[i].price).to.equal(expected);
                expect(observations[i].tokenLiquidity).to.equal(expected);
                expect(observations[i].quoteTokenLiquidity).to.equal(expected);
                expect(observations[i].timestamp).to.equal(expected);
            }
        }

        describe("An increment of 1", function () {
            describe("An offset of 0", function () {
                describe("The latest observation is at index 0", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 6;
                        const offset = 0;
                        const increment = 1;

                        // Push capacity + 1 observations so that the latest observation is at index 0
                        const observationsToPush = capacity + 1;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });

                describe("The latest observation is at index n-1", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 6;
                        const offset = 0;
                        const increment = 1;

                        // Push capacity observations so that the latest observation is at index n-1
                        const observationsToPush = capacity;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });
            });

            describe("An offset of 1", function () {
                describe("The latest observation is at index 0", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 5;
                        const offset = 1;
                        const increment = 1;

                        // Push capacity + 1 observations so that the latest observation is at index 0
                        const observationsToPush = capacity + 1;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });

                describe("The latest observation is at index n-1", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 5;
                        const offset = 1;
                        const increment = 1;

                        // Push capacity observations so that the latest observation is at index n-1
                        const observationsToPush = capacity;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });
            });
        });

        describe("An increment of 2", function () {
            describe("An offset of 0", function () {
                describe("The latest observation is at index 0", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 3;
                        const offset = 0;
                        const increment = 2;

                        // Push capacity + 1 observations so that the latest observation is at index 0
                        const observationsToPush = capacity + 1;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });

                describe("The latest observation is at index n-1", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 3;
                        const offset = 0;
                        const increment = 2;

                        // Push capacity observations so that the latest observation is at index n-1
                        const observationsToPush = capacity;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });
            });

            describe("An offset of 1", function () {
                describe("The latest observation is at index 0", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 2;
                        const offset = 1;
                        const increment = 2;

                        // Push capacity + 1 observations so that the latest observation is at index 0
                        const observationsToPush = capacity + 1;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });

                describe("The latest observation is at index n-1", function () {
                    it("Should return the observations in order", async function () {
                        const capacity = 6;
                        const amountToGet = 2;
                        const offset = 1;
                        const increment = 2;

                        // Push capacity observations so that the latest observation is at index n-1
                        const observationsToPush = capacity;

                        await pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush);
                    });
                });
            });
        });
    });

    describe("PeriodicAggregatorOracle#getObservations(token, amount)", function () {
        async function pushAndCheckObservations(capacity, amountToGet, offset, increment, observationsToPush) {
            await oracle.setObservationsCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await oracle.getObservationsCapacity(GRT)).to.equal(capacity);

            for (let i = 0; i < observationsToPush; i++) {
                await oracle.stubPush(GRT, i, i, i, i);
            }

            // Sanity check the count
            expect(await oracle.getObservationsCount(GRT)).to.equal(Math.min(observationsToPush, capacity));

            const observations = await oracle["getObservations(address,uint256)"](GRT, amountToGet);

            expect(observations.length).to.equal(amountToGet);

            for (let i = 0; i < amountToGet; ++i) {
                // The latest observation is at index 0 and will have the highest expected values
                // The following observations will have the expected values decrementing by 1
                const expected = observationsToPush - i * increment - 1 - offset;

                expect(observations[i].price).to.equal(expected);
                expect(observations[i].tokenLiquidity).to.equal(expected);
                expect(observations[i].quoteTokenLiquidity).to.equal(expected);
                expect(observations[i].timestamp).to.equal(expected);
            }
        }

        it("Default offset is 0 and increment is 1", async function () {
            const capacity = 6;
            const amountToGet = 6;

            // Push capacity observations so that the latest observation is at index n-1
            const observationsToPush = capacity;

            await pushAndCheckObservations(capacity, amountToGet, 0, 1, observationsToPush);
        });
    });

    describe("PeriodicAggregatorOracle#getObservationAt", function () {
        it("Should revert if the buffer is uninitialized", async function () {
            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(0);

            await expect(oracle.getObservationAt(GRT, 0)).to.be.revertedWith("InvalidIndex");
        });

        it("Should revert if the buffer is initialized but empty", async function () {
            await oracle.stubInitializeBuffers(GRT);

            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(0);

            await expect(oracle.getObservationAt(GRT, 0)).to.be.revertedWith("InvalidIndex");
        });

        it("Should revert if the index exceeds the number of observations with a full buffer", async function () {
            const capacity = 6;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Push capacity observations
            for (let i = 0; i < capacity; ++i) {
                await oracle.stubPush(GRT, 1, 1, 1, 1);
            }

            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(capacity);

            await expect(oracle.getObservationAt(GRT, capacity)).to.be.revertedWith("InvalidIndex");
        });

        it("Should revert if the index exceeds the number of observations but is within the capacity", async function () {
            const capacity = 6;

            await oracle.setObservationsCapacity(GRT, capacity);

            // Push capacity - 1 observations
            for (let i = 0; i < capacity - 1; ++i) {
                await oracle.stubPush(GRT, 1, 1, 1, 1);
            }

            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(capacity - 1);

            await expect(oracle.getObservationAt(GRT, capacity - 1)).to.be.revertedWith("InvalidIndex");
        });

        it("Should return the latest observation when index = 0", async function () {
            await oracle.setObservationsCapacity(GRT, 2);

            // Push capacity observations
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 2, 2, 2, 2);

            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(2);

            const observation = await oracle.getObservationAt(GRT, 0);

            expect(observation.price).to.equal(2);
            expect(observation.tokenLiquidity).to.equal(2);
            expect(observation.quoteTokenLiquidity).to.equal(2);
            expect(observation.timestamp).to.equal(2);
        });

        it("Should return the latest observation when index = 0 and the start was just overwritten", async function () {
            await oracle.setObservationsCapacity(GRT, 2);

            // Push capacity + 1 observations
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 2, 2, 2, 2);
            await oracle.stubPush(GRT, 3, 3, 3, 3);

            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(2);

            const observation = await oracle.getObservationAt(GRT, 0);

            expect(observation.price).to.equal(3);
            expect(observation.tokenLiquidity).to.equal(3);
            expect(observation.quoteTokenLiquidity).to.equal(3);
            expect(observation.timestamp).to.equal(3);
        });

        it("Should return the correct observation when index = 1 and the latest observation is at the start of the buffer", async function () {
            await oracle.setObservationsCapacity(GRT, 2);

            // Push capacity + 1 observations
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 2, 2, 2, 2);
            await oracle.stubPush(GRT, 3, 3, 3, 3);

            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(2);

            const observation = await oracle.getObservationAt(GRT, 1);

            expect(observation.price).to.equal(2);
            expect(observation.tokenLiquidity).to.equal(2);
            expect(observation.quoteTokenLiquidity).to.equal(2);
            expect(observation.timestamp).to.equal(2);
        });

        it("Should return the correct observation when index = 1 and the latest observation is at the end of the buffer", async function () {
            await oracle.setObservationsCapacity(GRT, 2);

            // Push capacity observations
            await oracle.stubPush(GRT, 1, 1, 1, 1);
            await oracle.stubPush(GRT, 2, 2, 2, 2);

            // Sanity check the observations count
            expect(await oracle.getObservationsCount(GRT)).to.equal(2);

            const observation = await oracle.getObservationAt(GRT, 1);

            expect(observation.price).to.equal(1);
            expect(observation.tokenLiquidity).to.equal(1);
            expect(observation.quoteTokenLiquidity).to.equal(1);
            expect(observation.timestamp).to.equal(1);
        });
    });
});
