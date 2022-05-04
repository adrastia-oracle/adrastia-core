const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const BAT = "0x0D8775F648430679A709E98d2b0Cb6250d2887EF";
const SHIB = "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE";
const ZRX = "0xE41d2489571d322189246DaFA5ebDe1F4699F498";

const PERIOD = 100;

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

        const oracle = await oracleFactory.deploy(
            quoteTokenName,
            quoteTokenAddress,
            quoteTokenSymbol,
            quoteTokenDecimals,
            oracles,
            tokenSpecificOracles,
            period
        );

        expect(await oracle.quoteTokenName()).to.equal(quoteTokenName);
        expect(await oracle.quoteTokenAddress()).to.equal(quoteTokenAddress);
        expect(await oracle.quoteTokenSymbol()).to.equal(quoteTokenSymbol);
        expect(await oracle.quoteTokenDecimals()).to.equal(quoteTokenDecimals);
        expect(await oracle.getOracles()).to.eql(oracles); // eql = deep equality
        expect(await oracle.period()).to.equal(period);

        expect(await oracle.getOraclesFor(grtOracle.token)).to.eql(
            oraclesFor(grtOracle.token, oracles, tokenSpecificOracles)
        );
    });

    it("Should revert if no underlying oracles are provided", async () => {
        await expect(oracleFactory.deploy("NAME", AddressZero, "NIL", 18, [], [], PERIOD)).to.be.revertedWith(
            "AggregatedOracle: MISSING_ORACLES"
        );
    });

    it("Should revert if duplicate general oracles are provided", async () => {
        const oracle1 = await underlyingOracleFactory.deploy(USDC);
        await oracle1.deployed();

        await expect(
            oracleFactory.deploy("NAME", AddressZero, "NIL", 18, [oracle1.address, oracle1.address], [], PERIOD)
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
            oracleFactory.deploy("NAME", AddressZero, "NIL", 18, [], [oracle1Config, oracle1Config], PERIOD)
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
            oracleFactory.deploy("NAME", AddressZero, "NIL", 18, [oracle1.address], [oracle1Config], PERIOD)
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should require an update if no observations have been made", async () => {
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Should require an update if deltaTime == period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Should require an update if deltaTime > period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD + 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD + 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
    });

    it("Shouldm't require an update if deltaTime < period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD - 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD - 1);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
    });

    it("Shouldm't require an update if deltaTime == 0", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime);

        expect(await currentBlockTimestamp()).to.equal(observationTime);
        expect(await oracle.needsUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle1.address], [], PERIOD);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    describe("Can't update when it", function () {
        it("Doesn't need an update", async function () {
            await oracle.overrideNeedsUpdate(true, false);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
        });

        it("Needs an update but there are no valid underlying oracle responses", async function () {
            await oracle.overrideNeedsUpdate(true, true);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(false);
        });
    });

    describe("Can update when it needs an update and when", function () {
        beforeEach(async function () {
            await oracle.overrideNeedsUpdate(true, true);
        });

        it("An underlying oracle needs an update", async function () {
            await underlyingOracle1.stubSetNeedsUpdate(true);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
        });

        it("An underlying oracle doesn't need an update but it has valid data", async function () {
            await underlyingOracle1.stubSetNeedsUpdate(false);

            const currentTime = await currentBlockTimestamp();

            await underlyingOracle1.stubSetObservation(AddressZero, 1, 1, 1, currentTime);

            expect(await oracle.canUpdate(ethers.utils.hexZeroPad(AddressZero, 32))).to.equal(true);
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultPrice(address)"](AddressZero)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should get the set price (=1)", async () => {
        const price = BigNumber.from(1);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, 1);

        expect(await oracle["consultPrice(address)"](AddressZero)).to.equal(price);
    });

    it("Should get the set price (=1e18)", async () => {
        const price = BigNumber.from(10).pow(18);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, 1);

        expect(await oracle["consultPrice(address)"](AddressZero)).to.equal(price);
    });

    it("Should return fixed values when token == quoteToken", async function () {
        const price = await oracle["consultPrice(address)"](await oracle.quoteTokenAddress());

        const expectedPrice = ethers.utils.parseUnits("1.0", await oracle.quoteTokenDecimals());

        expect(price).to.equal(expectedPrice);
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Should get the set price (=1)", async () => {
        const observationTime = await currentBlockTimestamp();
        const price = BigNumber.from(1);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, observationTime);

        expect(await oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.equal(price);
    });

    it("Should get the set price (=1e18)", async () => {
        const observationTime = await currentBlockTimestamp();
        const price = BigNumber.from(10).pow(18);

        await oracle.stubSetObservation(AddressZero, price, 1, 1, observationTime);

        expect(await oracle["consultPrice(address,uint256)"](AddressZero, MAX_AGE)).to.equal(price);
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address)"](AddressZero)).to.be.revertedWith(
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

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address)"](AddressZero);

            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consultLiquidity(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
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

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [tokenLiqudity, quoteTokenLiquidity] = await oracle["consultLiquidity(address,uint256)"](
                AddressZero,
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consult(address)"](AddressZero)).to.be.revertedWith("AbstractOracle: MISSING_OBSERVATION");
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

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address)"](AddressZero);

            expect(price).to.equal(_price);
            expect(tokenLiqudity).to.equal(_tokenLiqudity);
            expect(quoteTokenLiquidity).to.equal(_quoteTokenLiquidity);
        });
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

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
    });

    it("Should revert when the rate is expired (deltaTime > maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE + 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.be.revertedWith(
            "AbstractOracle: RATE_TOO_OLD"
        );
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime < maxAge)", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime + MAX_AGE - 1;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
    });

    it("Shouldn't revert when the rate is not expired (deltaTime == 0)", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        const time = observationTime;

        await hre.timeAndMine.setTime(time);

        expect(await currentBlockTimestamp()).to.equal(time);
        await expect(oracle["consult(address,uint256)"](AddressZero, MAX_AGE)).to.not.be.reverted;
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

            await oracle.stubSetObservation(AddressZero, _price, _tokenLiqudity, _quoteTokenLiquidity, observationTime);

            const [price, tokenLiqudity, quoteTokenLiquidity] = await oracle["consult(address,uint256)"](
                AddressZero,
                MAX_AGE
            );

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

        oracle = await oracleFactory.deploy("USD Coin", quoteToken, "USDC", 6, [underlyingOracle.address], [], PERIOD);
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
            PERIOD
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
            PERIOD
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

describe("AggregatedOracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const mockOracleFactory = await ethers.getContractFactory("MockOracle");
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");

        const underlyingOracle = await mockOracleFactory.deploy(USDC);
        await underlyingOracle.deployed();

        oracle = await oracleFactory.deploy("NAME", USDC, "NIL", 18, [underlyingOracle.address], [], PERIOD);
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
