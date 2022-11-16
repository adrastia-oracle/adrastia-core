const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const BAT = "0x0D8775F648430679A709E98d2b0Cb6250d2887EF";

const PERIOD = 100;
const MINIMUM_TOKEN_LIQUIDITY_VALUE = BigNumber.from(0);
const MINIMUM_QUOTE_TOKEN_LIQUIDITY = BigNumber.from(0);

const LOWEST_ACCEPTABLE_PRICE = BigNumber.from(2);
const LOWEST_ACCEPTABLE_LIQUIDITY = BigNumber.from(2);

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

describe("AggregatedOracle#constructor", async function () {
    var underlyingOracleFactory;
    var oracleFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("AggregatedOracle");
        underlyingOracleFactory = await ethers.getContractFactory("MockOracle");
    });

    function oraclesFor(token, oracles, tokenSpecificOracles) {
        var allOracles = [];

        for (const oracle of oracles) allOracles.push(oracle);

        for (const oracle of tokenSpecificOracles) {
            if (oracle.token == token) allOracles.push(oracle.oracle);
        }

        return allOracles;
    }

    it("Should deploy correctly with valid arguments", async function () {
        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        const oracle2 = await underlyingOracleFactory.deploy(USDC);
        await oracle2.deployed();

        const grtOracle = {
            token: GRT,
            oracle: oracle2.address,
        };

        const quoteTokenName = "USD Coin";
        const quoteTokenAddress = USDC;
        const quoteTokenSymbol = "USDC";
        const quoteTokenDecimals = 6;
        const oracles = [oracle1.address];
        const tokenSpecificOracles = [grtOracle];
        const period = 30;
        const minimumTokenLiquidityValue = BigNumber.from(1);
        const minimumQuoteTokenLiquidity = BigNumber.from(2);

        const oracle = await oracleFactory.deploy(
            quoteTokenName,
            quoteTokenAddress,
            quoteTokenSymbol,
            quoteTokenDecimals,
            oracles,
            tokenSpecificOracles,
            period,
            minimumTokenLiquidityValue,
            minimumQuoteTokenLiquidity
        );

        expect(await oracle.quoteTokenName()).to.equal(quoteTokenName);
        expect(await oracle.quoteTokenAddress()).to.equal(quoteTokenAddress);
        expect(await oracle.quoteTokenSymbol()).to.equal(quoteTokenSymbol);
        expect(await oracle.quoteTokenDecimals()).to.equal(quoteTokenDecimals);
        expect(await oracle.getOracles()).to.eql(oracles); // eql = deep equality
        expect(await oracle.period()).to.equal(period);
        expect(await oracle.minimumTokenLiquidityValue()).to.equal(minimumTokenLiquidityValue);
        expect(await oracle.minimumQuoteTokenLiquidity()).to.equal(minimumQuoteTokenLiquidity);

        expect(await oracle.getOraclesFor(grtOracle.token)).to.eql(
            oraclesFor(grtOracle.token, oracles, tokenSpecificOracles)
        );
    });

    it("Should revert if no underlying oracles are provided", async () => {
        await expect(
            oracleFactory.deploy(
                "NAME",
                USDC,
                "NIL",
                18,
                [],
                [],
                PERIOD,
                MINIMUM_TOKEN_LIQUIDITY_VALUE,
                MINIMUM_QUOTE_TOKEN_LIQUIDITY
            )
        ).to.be.revertedWith("AggregatedOracle: MISSING_ORACLES");
    });

    it("Should revert if duplicate general oracles are provided", async () => {
        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        await expect(
            oracleFactory.deploy(
                "NAME",
                USDC,
                "NIL",
                18,
                [oracle1.address, oracle1.address],
                [],
                PERIOD,
                MINIMUM_TOKEN_LIQUIDITY_VALUE,
                MINIMUM_QUOTE_TOKEN_LIQUIDITY
            )
        ).to.be.revertedWith("AggregatedOracle: DUPLICATE_ORACLE");
    });

    it("Should revert if duplicate token specific oracles are provided", async () => {
        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        const oracle1Config = {
            token: GRT,
            oracle: oracle1.address,
        };

        await expect(
            oracleFactory.deploy(
                "NAME",
                USDC,
                "NIL",
                18,
                [],
                [oracle1Config, oracle1Config],
                PERIOD,
                MINIMUM_TOKEN_LIQUIDITY_VALUE,
                MINIMUM_QUOTE_TOKEN_LIQUIDITY
            )
        ).to.be.revertedWith("AggregatedOracle: DUPLICATE_ORACLE");
    });

    it("Should revert if duplicate general / token specific oracles are provided", async () => {
        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        const oracle1Config = {
            token: GRT,
            oracle: oracle1.address,
        };

        await expect(
            oracleFactory.deploy(
                "NAME",
                USDC,
                "NIL",
                18,
                [oracle1.address],
                [oracle1Config],
                PERIOD,
                MINIMUM_TOKEN_LIQUIDITY_VALUE,
                MINIMUM_QUOTE_TOKEN_LIQUIDITY
            )
        ).to.be.revertedWith("AggregatedOracle: DUPLICATE_ORACLE");
    });
});

describe("AggregatedOracle#needsUpdate", function () {
    var oracle;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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

describe("AggregatedOracle#canUpdate", function () {
    var oracle;

    var underlyingOracle1;
    var underlyingOracle2;

    beforeEach(async function () {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle1 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle1.deployed();

        underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle1.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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
            await oracle.overrideValidateUnderlyingConsultation(true, false);

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

describe("AggregatedOracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
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

describe("AggregatedOracle#consultPrice(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        expect(await oracle["consultPrice(address,uint256)"](GRT, 0)).to.equal(price);
    });
});

describe("AggregatedOracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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

describe("AggregatedOracle#consultLiquidity(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
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

describe("AggregatedOracle#consultLiquidity(token, maxAge = 0)", function () {
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
    });

    it(`Should get the set price (=${LOWEST_ACCEPTABLE_PRICE})`, async () => {
        const price = LOWEST_ACCEPTABLE_PRICE;
        const tokenLiqudity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        const liquitity = await oracle["consultLiquidity(address,uint256)"](GRT, 0);

        expect(liquitity["tokenLiquidity"]).to.equal(tokenLiqudity);
        expect(liquitity["quoteTokenLiquidity"]).to.equal(quoteTokenLiquidity);
    });
});

describe("AggregatedOracle#consultLiquidity(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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

describe("AggregatedOracle#consult(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
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

describe("AggregatedOracle#consult(token, maxAge = 0)", function () {
    var oracleFactory;
    var mockOracleFactory;
    var underlyingOracle;
    var oracle;

    beforeEach(async () => {
        mockOracleFactory = await ethers.getContractFactory("MockOracle");
        oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
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
            "AggregatedOracle: INVALID_NUM_CONSULTATIONS"
        );
    });

    it("Should revert when the price exceeds uint112.max", async function () {
        // Redeploy with more quote token decimal places
        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

        const price = BigNumber.from(2).pow(112).sub(1); // = uint112.max
        const tokenLiqudity = BigNumber.from(2);
        const quoteTokenLiquidity = BigNumber.from(3);

        await underlyingOracle.stubSetInstantRates(GRT, price, tokenLiqudity, quoteTokenLiquidity);

        await expect(oracle["consult(address,uint256)"](GRT, 0)).to.be.revertedWith("AggregatedOracle: PRICE_TOO_HIGH");
    });

    it("Should report token liquidity of uint112.max when it exceeds that", async function () {
        const underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        // Redeploy with additional underlying oracle
        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            6,
            [underlyingOracle.address, underlyingOracle2.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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
        const underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        // Redeploy with additional underlying oracle
        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            6,
            [underlyingOracle.address, underlyingOracle2.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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
        const underlyingOracle2 = await mockOracleFactory.deploy(USDC);
        await underlyingOracle2.deployed();

        // Redeploy with additional underlying oracle
        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            6,
            [underlyingOracle.address, underlyingOracle2.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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

describe("AggregatedOracle#consult(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

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

describe("AggregatedOracle#update w/ 1 underlying oracle", function () {
    const quoteToken = USDC;
    const token = GRT;

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            quoteToken,
            "USDC",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Has correct price and quote token liquidity when the oracle has delta +2 quote token decimals", async function () {
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
        const expectedQuoteTokenLiquidity = quoteTokenLiquidity.mul(100);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, tokenLiquidity, expectedQuoteTokenLiquidity, timestamp);

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(expectedPrice);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Has correct price and quote token liquidity when the oracle has delta -2 quote token decimals", async function () {
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
        const expectedQuoteTokenLiquidity = quoteTokenLiquidity.div(100);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "Updated")
            .withArgs(token, expectedPrice, tokenLiquidity, expectedQuoteTokenLiquidity, timestamp);

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(expectedPrice);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Shouldn't use old rates", async () => {
        const price = ethers.utils.parseUnits("1", 18);
        const tokenLiquidity = ethers.utils.parseUnits("1", 18);
        const quoteTokenLiquidity = ethers.utils.parseUnits("1", 18);
        const timestamp = (await currentBlockTimestamp()) + PERIOD * 2 + 1;

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });

    it("Shouldn't update when there aren't any valid consultations", async () => {
        const timestamp = (await currentBlockTimestamp()) + 10;

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price is 0", async () => {
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

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's quote token liquidity is 0", async () => {
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

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });

    it("Shouldn't update when the underlying oracle's price and quote token liquidity is 0", async () => {
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

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(poPrice);
        expect(oTokenLiquidity).to.equal(poTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(poQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(poTimestamp);
    });
});

describe("AggregatedOracle#update w/ 2 underlying oracle", function () {
    const quoteToken = USDC;
    const token = GRT;

    var underlyingOracle1;
    var underlyingOracle2;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle1 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle1.deployed();

        underlyingOracle2 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle2.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            quoteToken,
            "USDC",
            6,
            [underlyingOracle1.address, underlyingOracle2.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(expectedPrice);
        expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("AggregatedOracle#update w/ 1 general underlying oracle and one token specific oracle", function () {
    const quoteToken = USDC;
    var token = GRT;

    var underlyingOracle;
    var tokenSpecificOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        tokenSpecificOracle = await mockOracleFactory.deploy(quoteToken);
        await tokenSpecificOracle.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            quoteToken,
            "USDC",
            6,
            [underlyingOracle.address],
            [
                {
                    token: GRT,
                    oracle: tokenSpecificOracle.address,
                },
            ],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("AggregatedOracle#update w/ 1 underlying oracle and a minimum token liquidity value", function () {
    const quoteToken = USDC;
    const token = GRT;
    const tokenDecimals = 18;

    const minimumTokenLiquidityValue = ethers.utils.parseUnits("10.0", 6); // 10 USDC worth
    const minimumQuoteTokenLiquidity = BigNumber.from(0);

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            quoteToken,
            "USDC",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            minimumTokenLiquidityValue,
            minimumQuoteTokenLiquidity
        );

        await oracle.overrideValidateUnderlyingConsultation(false, false);
        await oracle.overrideSanityCheckTvlDistributionRatio(true, true);
        await oracle.overrideSanityCheckQuoteTokenLiquidity(true, true);
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

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("AggregatedOracle#update w/ 1 underlying oracle and a minimum quote token liquidity", function () {
    const quoteToken = USDC;
    const token = GRT;
    const tokenDecimals = 18;

    const minimumTokenLiquidityValue = BigNumber.from(0);
    const minimumQuoteTokenLiquidity = ethers.utils.parseUnits("10.0", 6); // 10 USDC

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            quoteToken,
            "USDC",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            minimumTokenLiquidityValue,
            minimumQuoteTokenLiquidity
        );

        await oracle.overrideValidateUnderlyingConsultation(false, false);
        await oracle.overrideSanityCheckTvlDistributionRatio(true, true);
        await oracle.overrideSanityCheckTokenLiquidityValue(true, true);
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

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("AggregatedOracle#update w/ 1 underlying oracle and an allowed TVL distribution range", function () {
    const quoteToken = USDC;
    const token = GRT;
    const tokenDecimals = 18;

    var underlyingOracle;

    var oracle;

    beforeEach(async () => {
        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            quoteToken,
            "USDC",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

        await oracle.overrideValidateUnderlyingConsultation(false, false);
        await oracle.overrideSanityCheckTokenLiquidityValue(true, true);
        await oracle.overrideSanityCheckQuoteTokenLiquidity(true, true);
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

        const [poPrice, poTokenLiquidity, poQuoteTokenLiquidity, poTimestamp] = await oracle.observations(token);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(ethers.utils.hexZeroPad(token, 32)))
            .to.emit(oracle, "UpdateErrorWithReason")
            .withArgs(oracle.address, token, "AggregatedOracle: INVALID_NUM_CONSULTATIONS");

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("AggregatedOracle#update w/ 2 underlying oracles but one failing validation", function () {
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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        underlyingOracle1 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle1.deployed();

        underlyingOracle2 = await mockOracleFactory.deploy(quoteToken);
        await underlyingOracle2.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            quoteToken,
            "USDC",
            6,
            [underlyingOracle1.address, underlyingOracle2.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );

        await oracle.overrideValidateUnderlyingConsultation(false, false);
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

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(totalTokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);
        expect(oTimestamp).to.equal(timestamp);
    });
});

describe("AggregatedOracle#sanityCheckQuoteTokenLiquidity", function () {
    var oracleFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");
    });

    const tests = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
        ethers.constants.MaxUint256,
    ];

    const expectedReturn = (minimumQuoteTokenLiquidity, quoteTokenLiquidity) => {
        if (quoteTokenLiquidity.lt(minimumQuoteTokenLiquidity)) {
            return false;
        }

        return true;
    };

    for (const minimumQuoteTokenLiquidity of tests) {
        describe("Minimum quote token liquidity = " + minimumQuoteTokenLiquidity, function () {
            var oracle;

            beforeEach(async function () {
                const mockOracleFactory = await ethers.getContractFactory("MockOracle");

                underlyingOracle = await mockOracleFactory.deploy(USDC);
                await underlyingOracle.deployed();

                oracle = await oracleFactory.deploy(
                    "USD Coin",
                    USDC,
                    "USDC",
                    6,
                    [underlyingOracle.address],
                    [],
                    PERIOD,
                    MINIMUM_TOKEN_LIQUIDITY_VALUE,
                    minimumQuoteTokenLiquidity
                );
            });

            for (const quoteTokenLiquidity of tests) {
                if (quoteTokenLiquidity.gt(0)) {
                    it(
                        "Should return " +
                            expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.sub(1)) +
                            " when quoteTokenLiquidity = " +
                            quoteTokenLiquidity.sub(1),
                        async function () {
                            // Note: stubSanityCheckQuoteTokenLiquidity takes whole token amounts while
                            // quoteTokenLiquidity is in wei
                            expect(
                                await oracle.stubSanityCheckQuoteTokenLiquidity(
                                    quoteTokenLiquidity.div(BigNumber.from(10).pow(6)).sub(1)
                                )
                            ).to.equal(expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.sub(1)));
                        }
                    );
                }

                it(
                    "Should return " +
                        expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity) +
                        " when quoteTokenLiquidity = " +
                        quoteTokenLiquidity,
                    async function () {
                        // Note: stubSanityCheckQuoteTokenLiquidity takes whole token amounts while
                        // quoteTokenLiquidity is in wei
                        expect(
                            await oracle.stubSanityCheckQuoteTokenLiquidity(
                                quoteTokenLiquidity.div(BigNumber.from(10).pow(6))
                            )
                        ).to.equal(expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity));
                    }
                );

                if (quoteTokenLiquidity.lt(ethers.constants.MaxUint256)) {
                    it(
                        "Should return " +
                            expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.add(1)) +
                            " when quoteTokenLiquidity = " +
                            quoteTokenLiquidity.add(1),
                        async function () {
                            // Note: stubSanityCheckQuoteTokenLiquidity takes whole token amounts while
                            // quoteTokenLiquidity is in wei
                            expect(
                                await oracle.stubSanityCheckQuoteTokenLiquidity(
                                    quoteTokenLiquidity.div(BigNumber.from(10).pow(6)).add(1)
                                )
                            ).to.equal(expectedReturn(minimumQuoteTokenLiquidity, quoteTokenLiquidity.add(1)));
                        }
                    );
                }
            }
        });
    }
});

describe("AggregatedOracle#sanityCheckTokenLiquidityValue", function () {
    var oracleFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");
    });

    const tests = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
        ethers.constants.MaxUint256,
    ];

    const liquidities = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
    ];

    const prices = [
        BigNumber.from(0),
        BigNumber.from(1),
        ethers.utils.parseUnits("1.0", 6),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000", 18),
    ];

    const tokenDecimals = [0, 1, 6, 18];

    const tokenLiquidityValue = (price, tokenLiquidity, tokenDecimals) => {
        return price.mul(tokenLiquidity).div(ethers.utils.parseUnits("1", tokenDecimals));
    };

    const expectedReturn = (minimumTokenLiquidityValue, price, tokenLiquidity, tokenDecimals) => {
        const quoteTokenLiquidityValue = tokenLiquidityValue(price, tokenLiquidity, tokenDecimals);

        if (quoteTokenLiquidityValue.lt(minimumTokenLiquidityValue)) {
            return false;
        }

        return true;
    };

    for (const minimumTokenLiquidityValue of tests) {
        describe("Minimum token liquidity value = " + minimumTokenLiquidityValue, function () {
            var oracle;

            beforeEach(async function () {
                const mockOracleFactory = await ethers.getContractFactory("MockOracle");

                underlyingOracle = await mockOracleFactory.deploy(USDC);
                await underlyingOracle.deployed();

                oracle = await oracleFactory.deploy(
                    "USD Coin",
                    USDC,
                    "USDC",
                    6,
                    [underlyingOracle.address],
                    [],
                    PERIOD,
                    minimumTokenLiquidityValue,
                    MINIMUM_QUOTE_TOKEN_LIQUIDITY
                );
            });

            for (const decimals of tokenDecimals) {
                describe("Token decimals = " + decimals, function () {
                    var token;

                    beforeEach(async function () {
                        const mockTokenFactory = await ethers.getContractFactory("FakeERC20");

                        token = await mockTokenFactory.deploy("Name", "SYMB", decimals);
                    });

                    for (const price of prices) {
                        describe("Price = " + price, function () {
                            for (const tokenLiquidity of liquidities) {
                                describe("Token liquidity = " + tokenLiquidity, function () {
                                    it(
                                        "Should return " +
                                            expectedReturn(
                                                minimumTokenLiquidityValue,
                                                price,
                                                tokenLiquidity,
                                                decimals
                                            ) +
                                            " when tokenLiquidityValue = " +
                                            tokenLiquidityValue(price, tokenLiquidity, decimals),
                                        async function () {
                                            expect(
                                                await oracle.stubSanityCheckTokenLiquidityValue(
                                                    token.address,
                                                    price,
                                                    tokenLiquidity.div(BigNumber.from(10).pow(decimals))
                                                )
                                            ).to.equal(
                                                expectedReturn(
                                                    minimumTokenLiquidityValue,
                                                    price,
                                                    tokenLiquidity,
                                                    decimals
                                                )
                                            );
                                        }
                                    );
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});

describe("AggregatedOracle#sanityCheckTvlDistributionRatio", function () {
    var oracle;
    var oracleFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            USDC,
            "USDC",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
    });

    const liquidities = [
        BigNumber.from(0),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000000", 18),
        ethers.utils.parseUnits("1100000000", 18),
    ];

    const prices = [
        BigNumber.from(0),
        BigNumber.from(1),
        ethers.utils.parseUnits("1.0", 6),
        ethers.utils.parseUnits("1.0", 18),
        ethers.utils.parseUnits("1000000", 18),
    ];

    const tokenDecimals = [0, 1, 6, 18];

    const tvlDistributionRatio = (price, tokenLiquidity, quoteTokenLiquidity, tokenDecimals) => {
        if (quoteTokenLiquidity.eq(0)) {
            return BigNumber.from(0);
        }

        return price
            .mul(tokenLiquidity)
            .mul(100)
            .div(quoteTokenLiquidity)
            .div(ethers.utils.parseUnits("1", tokenDecimals));
    };

    const expectedReturn = (price, tokenLiquidity, quoteTokenLiquidity, tokenDecimals) => {
        if (quoteTokenLiquidity.eq(0)) {
            return false;
        }

        const ratio = tvlDistributionRatio(price, tokenLiquidity, quoteTokenLiquidity, tokenDecimals);

        if (ratio.lt(10) || ratio.gt(1000)) {
            // below 1:10 or above 10:1
            return false;
        }

        return true;
    };

    for (const decimals of tokenDecimals) {
        describe("Token decimals = " + decimals, function () {
            var token;

            beforeEach(async function () {
                const mockTokenFactory = await ethers.getContractFactory("FakeERC20");

                token = await mockTokenFactory.deploy("Name", "SYMB", decimals);
            });

            for (const price of prices) {
                describe("Price = " + price, function () {
                    for (const tokenLiquidity of liquidities) {
                        describe("Token liquidity = " + tokenLiquidity, function () {
                            for (const quoteTokenLiquidity of liquidities) {
                                describe("Quote token liquidity = " + tokenLiquidity, function () {
                                    it(
                                        "Should return " +
                                            expectedReturn(price, tokenLiquidity, quoteTokenLiquidity, decimals) +
                                            " when tvl distribution ratio = " +
                                            tvlDistributionRatio(price, tokenLiquidity, quoteTokenLiquidity, decimals),
                                        async function () {
                                            expect(
                                                await oracle.stubSanityCheckTvlDistributionRatio(
                                                    token.address,
                                                    price,
                                                    tokenLiquidity.div(BigNumber.from(10).pow(decimals)),
                                                    quoteTokenLiquidity.div(BigNumber.from(10).pow(6))
                                                )
                                            ).to.equal(
                                                expectedReturn(price, tokenLiquidity, quoteTokenLiquidity, decimals)
                                            );
                                        }
                                    );
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});

describe("AggregatedOracle#validateUnderlyingConsultation", function () {
    var oracle;
    var oracleFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "USD Coin",
            USDC,
            "USDC",
            6,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
    });

    const tests = [true, false];

    const expectedReturn = (
        sanityCheckTvlDistributionRatio,
        sanityCheckQuoteTokenLiquidity,
        sanityCheckTokenLiquidityValue
    ) => {
        return sanityCheckQuoteTokenLiquidity && sanityCheckTvlDistributionRatio && sanityCheckTokenLiquidityValue;
    };

    for (const sanityCheckTvlDistributionRatio of tests) {
        describe("Sanity check tvl distribution ratio = " + sanityCheckTvlDistributionRatio, function () {
            for (const sanityCheckQuoteTokenLiquidity of tests) {
                describe("Sanity check quote token liquidity = " + sanityCheckQuoteTokenLiquidity, function () {
                    for (const sanityCheckTokenLiquidityValue of tests) {
                        describe("Sanity check token liquidity value = " + sanityCheckTokenLiquidityValue, function () {
                            it(
                                "Should return " +
                                    expectedReturn(
                                        sanityCheckTvlDistributionRatio,
                                        sanityCheckQuoteTokenLiquidity,
                                        sanityCheckTokenLiquidityValue
                                    ),
                                async function () {
                                    await oracle.overrideValidateUnderlyingConsultation(false, false);

                                    await oracle.overrideSanityCheckTvlDistributionRatio(
                                        true,
                                        sanityCheckTvlDistributionRatio
                                    );
                                    await oracle.overrideSanityCheckQuoteTokenLiquidity(
                                        true,
                                        sanityCheckQuoteTokenLiquidity
                                    );
                                    await oracle.overrideSanityCheckTokenLiquidityValue(
                                        true,
                                        sanityCheckTokenLiquidityValue
                                    );

                                    // We input junk to stubValidateUnderlyingConsultation because we override everything
                                    expect(await oracle.stubValidateUnderlyingConsultation(USDC, 1, 1, 1)).to.equal(
                                        expectedReturn(
                                            sanityCheckTvlDistributionRatio,
                                            sanityCheckQuoteTokenLiquidity,
                                            sanityCheckTokenLiquidityValue
                                        )
                                    );
                                }
                            );
                        });
                    }
                });
            }
        });
    }
});

describe("AggregatedOracle#calculateMaxAge", function () {
    var underlyingOracle;

    var oracleFactory;

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        const mockOracleFactory = await ethers.getContractFactory("MockOracle");

        underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();
    });

    it("Shouldn't return 0 when period is 1", async function () {
        const oracle = await oracleFactory.deploy(
            "USD Coin",
            USDC,
            "USDC",
            6,
            [underlyingOracle.address],
            [],
            1, // period
            0,
            0
        );

        expect(await oracle.stubCalculateMaxAge()).to.not.equal(0);
    });

    const periods = [2, 100, 1000, 10000];

    for (const period of periods) {
        it(`Should return ${period - 1} when period = ${period}`, async function () {
            const oracle = await oracleFactory.deploy(
                "USD Coin",
                USDC,
                "USDC",
                6,
                [underlyingOracle.address],
                [],
                period, // period
                0,
                0
            );

            expect(await oracle.stubCalculateMaxAge()).to.equal(period - 1);
        });
    }
});

describe("AggregatedOracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy(
            "NAME",
            USDC,
            "NIL",
            18,
            [underlyingOracle.address],
            [],
            PERIOD,
            MINIMUM_TOKEN_LIQUIDITY_VALUE,
            MINIMUM_QUOTE_TOKEN_LIQUIDITY
        );
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IAggregatedOracle", async () => {
        const interfaceId = await interfaceIds.iAggregatedOracle();
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
});
