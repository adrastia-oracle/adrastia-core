const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

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
    var oracleFactory;

    var tests = [];

    const testPermutations = [
        [AddressZero, USDC], // quoteTokenAddress
        ["NIL", "USDC"], // quoteTokenSymbol
        [[AddressZero], [USDC], [AddressZero, USDC]], // oracles
        [BigNumber.from(1), BigNumber.from(100)], // period
    ];

    for (const combo of combos(testPermutations)) {
        tests.push({
            args: {
                quoteTokenAddress: combo[0],
                quoteTokenSymbol: combo[1],
                oracles: combo[2],
                period: combo[3],
            },
        });
    }

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");
    });

    tests.forEach(({ args }) => {
        it(`Should construct the oracle correctly with params ${JSON.stringify(args)}`, async () => {
            const oracle = await oracleFactory.deploy(
                args["quoteTokenAddress"],
                args["quoteTokenSymbol"],
                args["oracles"],
                args["period"]
            );

            expect(await oracle.quoteTokenAddress()).to.equal(args["quoteTokenAddress"]);
            expect(await oracle.quoteTokenSymbol()).to.equal(args["quoteTokenSymbol"]);
            expect(await oracle.getOracles()).to.eql(args["oracles"]); // eql = deep equality
            expect(await oracle.period()).to.equal(args["period"]);
        });
    });

    it("Should revert if no underlying oracles are provided", async () => {
        await expect(oracleFactory.deploy(AddressZero, "NIL", [], PERIOD)).to.be.revertedWith(
            "AggregatedOracle: No oracles provided."
        );
    });
});

describe("AggregatedOracle#needsUpdate", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, "NIL", [AddressZero], PERIOD);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);
    });

    it("Should require an update if no observations have been made", async () => {
        expect(await oracle.needsUpdate(AddressZero)).to.equal(true);
    });

    it("Should require an update if deltaTime == period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD);
        expect(await oracle.needsUpdate(AddressZero)).to.equal(true);
    });

    it("Should require an update if deltaTime > period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD + 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD + 1);
        expect(await oracle.needsUpdate(AddressZero)).to.equal(true);
    });

    it("Shouldm't require an update if deltaTime < period", async () => {
        const observationTime = await currentBlockTimestamp();

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime + PERIOD - 1);

        expect(await currentBlockTimestamp()).to.equal(observationTime + PERIOD - 1);
        expect(await oracle.needsUpdate(AddressZero)).to.equal(false);
    });

    it("Shouldm't require an update if deltaTime == 0", async () => {
        const observationTime = (await currentBlockTimestamp()) + 10;

        await oracle.stubSetObservation(AddressZero, 1, 1, 1, observationTime);

        await hre.timeAndMine.setTime(observationTime);

        expect(await currentBlockTimestamp()).to.equal(observationTime);
        expect(await oracle.needsUpdate(AddressZero)).to.equal(false);
    });
});

describe("AggregatedOracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, "NIL", [AddressZero], PERIOD);
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
});

describe("AggregatedOracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, "NIL", [AddressZero], PERIOD);

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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, "NIL", [AddressZero], PERIOD);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consultLiquidity(address)"](AddressZero)).to.be.revertedWith(
            "AbstractOracle: MISSING_OBSERVATION"
        );
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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, "NIL", [AddressZero], PERIOD);

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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, "NIL", [AddressZero], PERIOD);
    });

    it("Should revert when there's no observation", async () => {
        await expect(oracle["consult(address)"](AddressZero)).to.be.revertedWith("AbstractOracle: MISSING_OBSERVATION");
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
        const oracleFactory = await ethers.getContractFactory("AggregatedOracleStub");

        oracle = await oracleFactory.deploy(AddressZero, "NIL", [AddressZero], PERIOD);

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

        oracle = await oracleFactory.deploy(quoteToken, "USDC", [underlyingOracle.address], PERIOD);
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

        await expect(oracle.update(token))
            .to.emit(oracle, "Updated")
            .withArgs(token, quoteToken, timestamp, price, tokenLiquidity, quoteTokenLiquidity);

        expect(await underlyingOracle.callCounts(ethers.utils.formatBytes32String("update(address)"))).to.equal(
            BigNumber.from(1)
        );

        const [oPrice, oTokenLiquidity, oQuoteTokenLiquidity, oTimestamp] = await oracle.observations(token);

        expect(oPrice).to.equal(price);
        expect(oTokenLiquidity).to.equal(tokenLiquidity);
        expect(oQuoteTokenLiquidity).to.equal(quoteTokenLiquidity);
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

        await expect(oracle.update(token))
            .to.emit(oracle, "ConsultErrorWithReason")
            .withArgs(underlyingOracle.address, token, "AbstractOracle: RATE_TOO_OLD");

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
        expect(await oracle.callStatic.update(token)).to.equal(true);
        await underlyingOracle.stubSetUpdateReturn(false);
        expect(await oracle.callStatic.update(token)).to.equal(false);

        await hre.timeAndMine.setTimeNextBlock(timestamp);

        await expect(oracle.update(token))
            .to.emit(oracle, "ConsultError")
            .withArgs(
                underlyingOracle.address,
                token,
                "0x4e487b710000000000000000000000000000000000000000000000000000000000000011"
            );

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

        await expect(oracle.update(token))
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

        await expect(oracle.update(token))
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

        await expect(oracle.update(token))
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

        await expect(oracle.update(token))
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

        await expect(oracle.update(token))
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

        await expect(oracle.update(token))
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
            quoteToken,
            "USDC",
            [underlyingOracle1.address, underlyingOracle2.address],
            PERIOD
        );
    });

    it("Should update successfully", async () => {
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

        await expect(oracle.update(token))
            .to.emit(oracle, "Updated")
            .withArgs(token, quoteToken, timestamp, price, totalTokenLiquidity, totalQuoteTokenLiquidity);

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

    it("Should update successfully with differing prices", async () => {
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

        await expect(oracle.update(token))
            .to.emit(oracle, "Updated")
            .withArgs(token, quoteToken, timestamp, expectedPrice, totalTokenLiquidity, totalQuoteTokenLiquidity);

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