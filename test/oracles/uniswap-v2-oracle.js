const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;

const { abi: FACTORY_ABI, bytecode: FACTORY_BYTECODE } = require("@uniswap/v2-core/build/UniswapV2Factory.json");

const uniswapV2InitCodeHash = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

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

describe("UniswapV2Oracle#constructor", async function () {
    var oracleFactory;

    const tests = [
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV2InitCodeHash,
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
    ];

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");
    });

    tests.forEach(({ args }) => {
        it(`Should construct the oracle correctly with params ${JSON.stringify(args)}`, async () => {
            const oracle = await oracleFactory.deploy(
                args["liquidityAccumulator"],
                args["uniswapFactory"],
                args["initCodeHash"],
                args["quoteToken"],
                args["period"]
            );

            expect(await oracle.liquidityAccumulator()).to.equal(args["liquidityAccumulator"]);
            expect(await oracle.uniswapFactory()).to.equal(args["uniswapFactory"]);
            expect(await oracle.initCodeHash()).to.equal(args["initCodeHash"]);
            expect(await oracle.quoteToken()).to.equal(args["quoteToken"]);
            expect(await oracle.quoteTokenAddress()).to.equal(args["quoteToken"]);
            expect(await oracle.period()).to.equal(args["period"]);

            if (args["quoteToken"] === USDC) {
                expect(await oracle.quoteTokenName()).to.equal("USD Coin");
                expect(await oracle.quoteTokenSymbol()).to.equal("USDC");
                expect(await oracle.quoteTokenDecimals()).to.equal(6);
            }
        });
    });
});

describe("UniswapV2Oracle#needsUpdate", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, AddressZero, PERIOD);

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

describe("UniswapV2Oracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, USDC, PERIOD);
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

describe("UniswapV2Oracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, USDC, PERIOD);

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

describe("UniswapV2Oracle#consultLiquidity(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, USDC, PERIOD);
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

describe("UniswapV2Oracle#consultLiquidity(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, USDC, PERIOD);

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

describe("UniswapV2Oracle#consult(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, USDC, PERIOD);
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

describe("UniswapV2Oracle#consult(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, USDC, PERIOD);

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

describe("UniswapV2Oracle#computeWholeUnitAmount", function () {
    var oracle;

    const tests = [
        {
            decimals: 0,
            wholeUnitAmount: BigNumber.from(1),
        },
        {
            decimals: 1,
            wholeUnitAmount: BigNumber.from(10),
        },
        {
            decimals: 6,
            wholeUnitAmount: BigNumber.from(1000000),
        },
        {
            decimals: 18,
            wholeUnitAmount: BigNumber.from("1000000000000000000"),
        },
    ];

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, AddressZero, PERIOD);
    });

    tests.forEach(({ decimals, wholeUnitAmount }) => {
        it(`Should verify that a token with ${decimals} decimals has a whole unit amount of ${wholeUnitAmount.toString()}`, async () => {
            const erc20Factory = await ethers.getContractFactory("FakeERC20");

            const token = await erc20Factory.deploy("Token", "T", decimals);
            await token.deployed();

            expect(await oracle.stubComputeWholeUnitAmount(token.address)).to.equal(wholeUnitAmount);
        });
    });
});

describe("UniswapV2Oracle#computeAmountOut", function () {
    var oracle;

    const tests = [
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("1000000000000000000"),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("1000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("500000000000000000"),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("500000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("1000000000000000000"),
                priceCumulativeEnd: BigNumber.from("2000000000000000000"),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("1000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: MaxUint256,
                priceCumulativeEnd: BigNumber.from("1000000000000000000").sub(1),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("1000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("1000000000000000000"),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("1000000000000000000000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("500000000000000000"),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("500000000000000000000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("1000000000000000000"),
                priceCumulativeEnd: BigNumber.from("2000000000000000000"),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("1000000000000000000000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: MaxUint256,
                priceCumulativeEnd: BigNumber.from("1000000000000000000").sub(1),
                timeElapsed: BigNumber.from(1),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("1000000000000000000000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("1000000000000000000"),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("100000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("500000000000000000"),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("50000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("1000000000000000000"),
                priceCumulativeEnd: BigNumber.from("2000000000000000000"),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("100000000000"),
        },
        {
            args: {
                priceCumulativeStart: MaxUint256,
                priceCumulativeEnd: BigNumber.from("1000000000000000000").sub(1),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1"),
            },
            expectedOutput: BigNumber.from("100000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("1000000000000000000"),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("100000000000000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("0"),
                priceCumulativeEnd: BigNumber.from("500000000000000000"),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("50000000000000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: BigNumber.from("1000000000000000000"),
                priceCumulativeEnd: BigNumber.from("2000000000000000000"),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("100000000000000000000000000000"),
        },
        {
            args: {
                priceCumulativeStart: MaxUint256,
                priceCumulativeEnd: BigNumber.from("1000000000000000000").sub(1),
                timeElapsed: BigNumber.from("10000000"),
                amountIn: BigNumber.from("1000000000000000000"),
            },
            expectedOutput: BigNumber.from("100000000000000000000000000000"),
        },
    ];

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, AddressZero, PERIOD);
    });

    tests.forEach(({ args, expectedOutput }) => {
        it(`Should verify that computeAmountOut(raw(${args["priceCumulativeStart"].toString()}), raw(${args[
            "priceCumulativeEnd"
        ].toString()}), ${args["timeElapsed"].toString()}, ${
            args["amountIn"]
        }) = ${expectedOutput.toString()}`, async () => {
            expect(
                await oracle.stubComputeAmountOut(
                    args["priceCumulativeStart"],
                    args["priceCumulativeEnd"],
                    args["timeElapsed"],
                    args["amountIn"]
                )
            ).to.equal(expectedOutput);
        });
    });
});

describe("UniswapV2Oracle#update", function () {
    const MIN_UPDATE_DELAY = 1;
    const MAX_UPDATE_DELAY = 2;
    const TWO_PERCENT_CHANGE = 2000000;

    var quoteToken;
    var token;
    var ltToken;
    var gtToken;

    var uniswapFactory;
    var liquidityAccumulator;
    var oracle;
    var addressHelper;

    async function createPair() {
        await uniswapFactory.createPair(token.address, quoteToken.address);
    }

    async function addLiquidity(tokenLiquidity, quoteTokenLiquidity) {
        const [owner] = await ethers.getSigners();

        const pair = await uniswapFactory.getPair(token.address, quoteToken.address);
        const pairContract = await ethers.getContractAt("FakeUniswapV2Pair", pair);

        // Approve transfers to pair
        await token.approve(pair, tokenLiquidity);
        await quoteToken.approve(pair, quoteTokenLiquidity);

        // Send tokens to pair
        await token.transfer(pair, tokenLiquidity);
        await quoteToken.transfer(pair, quoteTokenLiquidity);

        // Mint the LP tokens
        await pairContract.mint(owner.address);
    }

    // Testing points:
    // - Does not need update ✔
    // - Needs update ✔
    //   - Revert: POOL_NOT_FOUND ✔
    //   - token < quoteToken & opposite ✔
    //   - No prior observation ✔
    //   - Revert: MISSING_RESERVES_TIMESTAMP ✔
    //   - Price accumulation timeElapsed == 0 & opposite ✔
    //   - Liquidity accumulator updated if needed & opposite ✔
    //   - Liquidity accumulation changed (& not changed) ✔
    //     - No prior accumulation & opposite ✔
    //   - Updated event ✔
    //     - Match event data with observation data ✔
    //   - Various combinations of underlying data points ✔
    //   - Correctly calculates price when token decimals vary ✔
    var tests = [
        {
            desc: "Should not update if not needed",
            preCallFunc: async function () {
                await oracle.overrideNeedsUpdate(true, false);
            },
            expectedRevert: undefined,
            expectedOutput: false,
        },
        {
            desc: "Should revert if the token pair is invalid",
            preCallFunc: async function () {
                await oracle.overrideNeedsUpdate(true, true);
            },
            expectedRevert: "UniswapV2Oracle: POOL_NOT_FOUND",
            expectedOutput: undefined,
        },
        {
            desc: "Should revert if the token pair pool is empty",
            preCallFunc: async function () {
                await oracle.overrideNeedsUpdate(true, true);
                await createPair();
            },
            expectedRevert: "UniswapV2Oracle: MISSING_RESERVES_TIMESTAMP",
            expectedOutput: undefined,
        },
    ];

    function createShouldUpdateTest(
        useLtToken,
        tokenLiquidity = ethers.utils.parseUnits("1", 18),
        quoteTokenLiquidity = ethers.utils.parseUnits("1", 18),
        initialTokenLiquidity = undefined,
        initialQuoteTokenLiquidity = undefined,
        deltaTime = 100,
        tokenDecimals = 18,
        quoteTokenDecimals = 18
    ) {
        var totalTokenLiquidity = tokenLiquidity;
        var totalQuoteTokenLiquidity = quoteTokenLiquidity;

        if (initialTokenLiquidity !== undefined) totalTokenLiquidity = totalTokenLiquidity.add(initialTokenLiquidity);
        if (initialQuoteTokenLiquidity !== undefined)
            totalQuoteTokenLiquidity = totalQuoteTokenLiquidity.add(initialQuoteTokenLiquidity);

        return {
            desc:
                `Should update (token = ${useLtToken ? "ltToken" : "gtToken"}, ` +
                `tokenLiquidity = ${tokenLiquidity.toString()}, ` +
                `quoteTokenLiquidity = ${quoteTokenLiquidity.toString()}, ` +
                (initialTokenLiquidity === undefined
                    ? ""
                    : `initialTokenLiquidity = ${initialTokenLiquidity.toString()}, `) +
                (initialQuoteTokenLiquidity === undefined
                    ? ""
                    : `initialQuoteTokenLiquidity = ${initialQuoteTokenLiquidity.toString()}, `) +
                `deltaTime = ${deltaTime}, tokenDecimals = ${tokenDecimals}, quoteTokenDecimals = ${quoteTokenDecimals})`,
            preCallFunc: async function () {
                token = useLtToken ? ltToken : gtToken;

                await token.setDecimals(tokenDecimals);
                await quoteToken.setDecimals(quoteTokenDecimals);

                await oracle.overrideNeedsUpdate(true, true);
                await createPair();

                if (initialTokenLiquidity !== undefined && initialQuoteTokenLiquidity !== undefined) {
                    // We are testing the 2nd or higher order update, so let's setup the first observation
                    await addLiquidity(initialTokenLiquidity, initialQuoteTokenLiquidity);
                    await oracle.update(token.address); // Initial update

                    // Set the time for the next update
                    await hre.timeAndMine.setTime((await currentBlockTimestamp()) + deltaTime - 1);
                }

                // Time increases by 1 second with each block mined
                await hre.timeAndMine.setTimeIncrease(1);

                await addLiquidity(tokenLiquidity, quoteTokenLiquidity);
            },
            expectedRevert: undefined,
            expectedOutput: true,
            totalTokenLiquidity: totalTokenLiquidity,
            totalQuoteTokenLiquidity: totalQuoteTokenLiquidity,
        };
    }

    const liquiditiesToTest = [ethers.utils.parseUnits("1", 18), ethers.utils.parseUnits("2", 18)];

    const initialLiquiditiesToTest = liquiditiesToTest.concat([undefined]);

    const shouldUpdateTestPermutations = [
        [true, false],
        liquiditiesToTest,
        liquiditiesToTest,
        initialLiquiditiesToTest,
        initialLiquiditiesToTest,
        [100],
        [6, 18],
        [6, 18],
    ];

    // Create should update test combinations
    var shouldUpdateTestCombos = combos(shouldUpdateTestPermutations);

    // Remove invalid combinations
    shouldUpdateTestCombos = shouldUpdateTestCombos.filter(
        (e) => (e[3] === undefined && e[4] === undefined) || (e[3] !== undefined && e[4] !== undefined)
    );

    // Add all combinations of shouldUpdateTestPermutations to our tests
    for (const combo of shouldUpdateTestCombos)
        tests.push(
            createShouldUpdateTest(combo[0], combo[1], combo[2], combo[3], combo[4], combo[5], combo[6], combo[7])
        );

    beforeEach(async () => {
        const [owner] = await ethers.getSigners();

        const erc20Factory = await ethers.getContractFactory("FakeERC20");
        const uniswapFactoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
        const liquidityAccumulatorFactory = await ethers.getContractFactory("UniswapV2LiquidityAccumulator");
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");
        const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

        addressHelper = await addressHelperFactory.deploy();

        var tokens = [undefined, undefined, undefined];

        for (var i = 0; i < tokens.length; ++i) tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
        for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

        tokens = tokens.sort(async (a, b) => await addressHelper.lessThan(a.address, b.address));

        token = ltToken = tokens[0];
        quoteToken = tokens[1];
        gtToken = tokens[2];

        uniswapFactory = await uniswapFactoryFactory.deploy(owner.getAddress());
        await uniswapFactory.deployed();

        liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            uniswapFactory.address,
            uniswapV2InitCodeHash,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        oracle = await oracleFactory.deploy(
            liquidityAccumulator.address,
            uniswapFactory.address,
            uniswapV2InitCodeHash,
            quoteToken.address,
            PERIOD
        );
    });

    it("Should revert if token == quoteToken", async function () {
        await expect(oracle.update(quoteToken.address)).to.be.reverted;
    });

    it("Should revert if token == address(0)", async function () {
        await expect(oracle.update(AddressZero)).to.be.reverted;
    });

    tests.forEach(
        ({ desc, preCallFunc, expectedRevert, expectedOutput, totalTokenLiquidity, totalQuoteTokenLiquidity }) => {
            it(desc, async () => {
                await preCallFunc();

                if (expectedRevert === undefined) {
                    // Time increases by 1 second with each block mined
                    await hre.timeAndMine.setTimeIncrease(1);

                    expect(await oracle.callStatic.update(token.address)).to.equal(expectedOutput);

                    const [pPrice, pTokenLiqudity, pQuoteTokenLiquidity, pTimestamp] = await oracle.observations(
                        token.address
                    );

                    const updateTxPromise = oracle.update(token.address);

                    if (expectedOutput) {
                        // Update expected

                        const expectedTimestamp = (await currentBlockTimestamp()) + 1;

                        await updateTxPromise; // Call update

                        const updateTx = await updateTxPromise;
                        const updateReceipt = await updateTx.wait();

                        const updateTime = await blockTimestamp(updateReceipt.blockNumber);

                        // Verify the timestamp matches expected
                        expect(updateTime).to.equal(expectedTimestamp);

                        [price, tokenLiquidity, quoteTokenLiquidity, timestamp] = await oracle.observations(
                            token.address
                        );

                        // Verify the current observation matches expected
                        // expect(price).to.equal(TODO);
                        // expect(tokenLiqudity).to.equal(TODO);
                        // expect(quoteTokenLiquidity).to.equal(TODO);
                        expect(timestamp).to.equal(BigNumber.from(updateTime));

                        // Verify the correct log was emitted
                        await expect(updateTxPromise)
                            .to.emit(oracle, "Updated")
                            .withArgs(
                                token.address,
                                quoteToken.address,
                                BigNumber.from(expectedTimestamp),
                                price,
                                tokenLiquidity,
                                quoteTokenLiquidity
                            );
                        await expect(updateTxPromise).to.emit(liquidityAccumulator, "Updated");

                        // Fast-forward and update s.t. reported price and token liquities will equal calculations based on total liquidites
                        // (since we use time-weighted averages)
                        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + PERIOD);
                        await oracle.update(token.address);
                        await hre.timeAndMine.setTime((await currentBlockTimestamp()) + PERIOD);

                        const lastExpectedTimestamp = (await currentBlockTimestamp()) + 1;
                        const lasteUpdateTx = await oracle.update(token.address);

                        [price, tokenLiquidity, quoteTokenLiquidity, timestamp] = await oracle.observations(
                            token.address
                        );

                        const decimalFactor = BigNumber.from(10).pow(await token.decimals());

                        const expectedPrice = totalQuoteTokenLiquidity.mul(decimalFactor).div(totalTokenLiquidity);

                        expect(price).to.equal(expectedPrice);
                        expect(tokenLiquidity).to.equal(totalTokenLiquidity);
                        expect(quoteTokenLiquidity).to.equal(totalQuoteTokenLiquidity);

                        await expect(lasteUpdateTx)
                            .to.emit(oracle, "Updated")
                            .withArgs(
                                token.address,
                                quoteToken.address,
                                lastExpectedTimestamp,
                                price,
                                tokenLiquidity,
                                quoteTokenLiquidity
                            );
                    } else {
                        // No update should have occurred

                        await expect(updateTxPromise).to.not.emit(oracle, "Updated");

                        const [price, tokenLiqudity, quoteTokenLiquidity, timestamp] = await oracle.observations(
                            token.address
                        );

                        // Verify the current observation hasn't changed
                        expect(price).to.equal(pPrice);
                        expect(tokenLiqudity).to.equal(pTokenLiqudity);
                        expect(quoteTokenLiquidity).to.equal(pQuoteTokenLiquidity);
                        expect(timestamp).to.equal(pTimestamp);
                    }
                } else {
                    await expect(oracle.update(token.address)).to.be.revertedWith(expectedRevert);
                }
            });
        }
    );
});

describe("UniswapV2Oracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV2OracleStub");
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV2InitCodeHash, USDC, PERIOD);
        interfaceIds = await interfaceIdsFactory.deploy();
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

    it("Should support IUpdateByToken", async () => {
        const interfaceId = await interfaceIds.iUpdateByToken();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHasLiquidityAccumulator", async () => {
        const interfaceId = await interfaceIds.iHasLiquidityAccumulator();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
