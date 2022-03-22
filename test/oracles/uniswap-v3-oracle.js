const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;
const MaxUint256 = ethers.constants.MaxUint256;
const bn = require("bignumber.js");

const {
    abi: FACTORY_ABI,
    bytecode: FACTORY_BYTECODE,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");

const {
    abi: POOL_ABI,
    bytecode: POOL_BYTECODE,
} = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json");

const uniswapV3InitCodeHash = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

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

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// returns the sqrt price as a 64x96
// https://github.com/Uniswap/v3-core/blob/c05a0e2c8c08c460fb4d05cfdda30b3ad8deeaac/test/shared/utilities.ts#L63
function encodePriceSqrt(reserve1, reserve0) {
    return BigNumber.from(
        new bn(reserve1.toString())
            .div(reserve0.toString())
            .sqrt()
            .multipliedBy(new bn(2).pow(96))
            .integerValue(3)
            .toString()
    );
}

const TICK_SPACINGS = {
    500: 10,
    3000: 60,
    10000: 200,
};

const getMinTick = (tickSpacing) => Math.ceil(-887272 / tickSpacing) * tickSpacing;
const getMaxTick = (tickSpacing) => Math.floor(887272 / tickSpacing) * tickSpacing;

describe("UniswapV3Oracle#constructor", async function () {
    var oracleFactory;

    const tests = [
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: AddressZero,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: AddressZero,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: AddressZero,
                period: BigNumber.from(100),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(1),
            },
        },
        {
            args: {
                liquidityAccumulator: USDC,
                uniswapFactory: USDC,
                initCodeHash: uniswapV3InitCodeHash,
                poolFees: [3000],
                quoteToken: USDC,
                period: BigNumber.from(100),
            },
        },
    ];

    beforeEach(async () => {
        oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");
    });

    tests.forEach(({ args }) => {
        it(`Should construct the oracle correctly with params ${JSON.stringify(args)}`, async () => {
            const oracle = await oracleFactory.deploy(
                args["liquidityAccumulator"],
                args["uniswapFactory"],
                args["initCodeHash"],
                args["poolFees"],
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

describe("UniswapV3Oracle#needsUpdate", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(
            AddressZero,
            AddressZero,
            uniswapV3InitCodeHash,
            [3000],
            AddressZero,
            PERIOD
        );

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

describe("UniswapV3Oracle#consultPrice(token)", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV3InitCodeHash, [3000], USDC, PERIOD);
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

describe("UniswapV3Oracle#consultPrice(token, maxAge)", function () {
    const MAX_AGE = 60;

    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV3InitCodeHash, [3000], USDC, PERIOD);

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

describe("UniswapV3Oracle#consultLiquidity(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV3InitCodeHash, [3000], USDC, PERIOD);
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

describe("UniswapV3Oracle#consultLiquidity(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV3InitCodeHash, [3000], USDC, PERIOD);

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

describe("UniswapV3Oracle#consult(token)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV3InitCodeHash, [3000], USDC, PERIOD);
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

describe("UniswapV3Oracle#consult(token, maxAge)", function () {
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
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(AddressZero, AddressZero, uniswapV3InitCodeHash, [3000], USDC, PERIOD);

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

describe("UniswapV3Oracle#update", function () {
    this.timeout(100000);

    const MIN_UPDATE_DELAY = 1;
    const MAX_UPDATE_DELAY = 2;
    const TWO_PERCENT_CHANGE = 2000000;

    const POOL_FEES = [3000, 123];

    var quoteToken;
    var token;
    var ltToken;
    var gtToken;

    var uniswapFactory;
    var liquidityAccumulator;
    var oracle;
    var helper;
    var addressHelper;

    var expectedTokenLiquidity;
    var expectedQuoteTokenLiquidity;
    var expectedPrice;

    beforeEach(async () => {
        const erc20Factory = await ethers.getContractFactory("FakeERC20");
        const uniswapFactoryFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
        const liquidityAccumulatorFactory = await ethers.getContractFactory("UniswapV3LiquidityAccumulatorStub");
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");
        const helperFactory = await ethers.getContractFactory("UniswapV3Helper");
        const addressHelperFactory = await ethers.getContractFactory("AddressHelper");

        addressHelper = await addressHelperFactory.deploy();

        var tokens = [undefined, undefined, undefined];

        for (var i = 0; i < tokens.length; ++i) tokens[i] = await erc20Factory.deploy("Token " + i, "TOK" + i, 18);
        for (var i = 0; i < tokens.length; ++i) await tokens[i].deployed();

        tokens = tokens.sort(async (a, b) => await addressHelper.lessThan(a.address, b.address));

        token = ltToken = tokens[0];
        quoteToken = tokens[1];
        gtToken = tokens[2];

        uniswapFactory = await uniswapFactoryFactory.deploy();
        await uniswapFactory.deployed();

        liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            uniswapFactory.address,
            uniswapV3InitCodeHash,
            POOL_FEES,
            quoteToken.address,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        oracle = await oracleFactory.deploy(
            liquidityAccumulator.address,
            uniswapFactory.address,
            uniswapV3InitCodeHash,
            POOL_FEES,
            quoteToken.address,
            1
        );
        helper = await helperFactory.deploy(uniswapFactory.address, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

        expectedTokenLiquidity = BigNumber.from(0);
        expectedQuoteTokenLiquidity = BigNumber.from(0);
        expectedPrice = BigNumber.from(0);
    });

    async function createPool(sqrtPrice, fee = 3000) {
        await uniswapFactory.createPool(token.address, quoteToken.address, fee);

        const pool = await uniswapFactory.getPool(token.address, quoteToken.address, fee);
        const poolContract = await ethers.getContractAt(POOL_ABI, pool);

        poolContract.initialize(sqrtPrice);
    }

    async function addLiquidity(tokenLiquidity, quoteTokenLiquidity, fee = 3000) {
        const [owner] = await ethers.getSigners();

        var token0;
        var token1;

        var amount0;
        var amount1;

        if (await addressHelper.lessThan(token.address, quoteToken.address)) {
            token0 = token.address;
            token1 = quoteToken.address;

            amount0 = tokenLiquidity;
            amount1 = quoteTokenLiquidity;
        } else {
            token1 = token.address;
            token0 = quoteToken.address;

            amount1 = tokenLiquidity;
            amount0 = quoteTokenLiquidity;
        }

        const params = {
            token0: token0,
            token1: token1,
            fee: fee,
            recipient: owner.address,
            tickLower: getMinTick(TICK_SPACINGS[fee]),
            tickUpper: getMaxTick(TICK_SPACINGS[fee]),
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0,
            amount1Min: 0,
        };

        await token.approve(helper.address, MaxUint256);
        await quoteToken.approve(helper.address, MaxUint256);

        const [, rAmount0, rAmount1] = await helper.callStatic.helperAddLiquidity(params);

        await helper.helperAddLiquidity(params);

        if (await addressHelper.lessThan(token.address, quoteToken.address)) {
            expectedTokenLiquidity = expectedTokenLiquidity.add(rAmount0);
            expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(rAmount1);
        } else {
            expectedTokenLiquidity = expectedTokenLiquidity.add(rAmount1);
            expectedQuoteTokenLiquidity = expectedQuoteTokenLiquidity.add(rAmount0);
        }

        const decimalFactor = BigNumber.from(10).pow(await token.decimals());
        const precisionFactor = BigNumber.from(10).pow(6);

        expectedPrice = expectedQuoteTokenLiquidity
            .mul(precisionFactor)
            .mul(decimalFactor)
            .div(expectedTokenLiquidity)
            .div(precisionFactor);
    }

    it("Should revert if token == quoteToken", async function () {
        await expect(oracle.update(quoteToken.address)).to.be.reverted;
    });

    it("Should revert if token == address(0)", async function () {
        await expect(oracle.update(AddressZero)).to.be.reverted;
    });

    it("Should revert when there's no liquidity", async function () {
        await createPool(encodePriceSqrt(1, 1));

        await expect(oracle.update(token.address)).to.be.revertedWith("UniswapV3Oracle: NO_LIQUIDITY");
    });

    it("Shouldn't update if not needed", async function () {
        await oracle.overrideNeedsUpdate(true, false);

        expect(await oracle.callStatic.update(token.address)).to.equal(false);

        const [pPrice, pTokenLiqudity, pQuoteTokenLiquidity, pTimestamp] = await oracle.observations(token.address);

        const updateTxPromise = oracle.update(token.address);

        await expect(updateTxPromise).to.not.emit(oracle, "Updated");

        const [price, tokenLiqudity, quoteTokenLiquidity, timestamp] = await oracle.observations(token.address);

        // Verify the current observation hasn't changed
        expect(price).to.equal(pPrice);
        expect(tokenLiqudity).to.equal(pTokenLiqudity);
        expect(quoteTokenLiquidity).to.equal(pQuoteTokenLiquidity);
        expect(timestamp).to.equal(pTimestamp);
    });

    const testUpdateSuccess = async function (_tokenLiquidity, _quoteTokenLiquidity) {
        const sqrtPrice = (await addressHelper.greaterThan(token.address, quoteToken.address))
            ? encodePriceSqrt(_tokenLiquidity, _quoteTokenLiquidity)
            : encodePriceSqrt(_quoteTokenLiquidity, _tokenLiquidity);

        await createPool(sqrtPrice);
        await addLiquidity(_tokenLiquidity, _quoteTokenLiquidity);

        // Verify that the expected price based off input matches the expected price based off the uniswap helper
        {
            const decimalFactor = BigNumber.from(10).pow(await token.decimals());
            const precisionFactor = BigNumber.from(10).pow(6);

            const expectedPriceFromInput = _quoteTokenLiquidity
                .mul(precisionFactor)
                .mul(decimalFactor)
                .div(_tokenLiquidity)
                .div(precisionFactor);

            const expectedPriceFloor = expectedPriceFromInput.sub(expectedPriceFromInput.div(100));
            const expectedPriceCeil = expectedPriceFromInput.add(expectedPriceFromInput.div(100));

            // Check that price is equal to expected price +- 1% to account for loss of precision
            expect(expectedPrice).to.be.within(expectedPriceFloor, expectedPriceCeil);
        }

        // Perform two initial updates so that the liquidity accumulator is properly initialized
        {
            await hre.timeAndMine.setTime((await currentBlockTimestamp()) + PERIOD);
            await oracle.update(token.address);
            await hre.timeAndMine.setTime((await currentBlockTimestamp()) + PERIOD);
            await oracle.update(token.address);
        }

        const expectedTimestamp = (await currentBlockTimestamp()) + 100;

        await hre.timeAndMine.setTimeNextBlock(expectedTimestamp);

        const updateReceipt = await oracle.update(token.address);

        [price, tokenLiquidity, quoteTokenLiquidity, timestamp] = await oracle.observations(token.address);

        // Verify that the observation matches what's expected
        {
            const expectedPriceFloor = expectedPrice.sub(expectedPrice.div(100));
            const expectedPriceCeil = expectedPrice.add(expectedPrice.div(100));

            // Check that price is equal to expected price +- 1% to account for loss of precision
            expect(price).to.be.within(expectedPriceFloor, expectedPriceCeil);

            expect(tokenLiquidity).to.equal(expectedTokenLiquidity);
            expect(quoteTokenLiquidity).to.equal(expectedQuoteTokenLiquidity);

            expect(timestamp).to.equal(expectedTimestamp);
        }

        // Verify that the log matches the observation
        expect(updateReceipt)
            .to.emit(oracle, "Updated")
            .withArgs(token.address, quoteToken.address, timestamp, price, tokenLiquidity, quoteTokenLiquidity);
    };

    const liquidityPermutations = [
        [
            // tokenLiquidity
            ethers.utils.parseUnits("1000.0", 18),
            ethers.utils.parseUnits("10000.0", 18),
            ethers.utils.parseUnits("500000.0", 18),
        ],
        [
            // quoteTokenLiquidity
            ethers.utils.parseUnits("1000.0", 18),
            ethers.utils.parseUnits("10000.0", 18),
            ethers.utils.parseUnits("500000.0", 18),
        ],
    ];

    var updateTestCombos = combos(liquidityPermutations);

    function describeSingleTokenTests() {
        for (const combo of updateTestCombos) {
            it(`Should update successfully with tokenLiquidity=${combo[0].toString()} and quoteTokenLiquidity=${combo[1].toString()}`, async function () {
                await testUpdateSuccess(combo[0], combo[1]);
            });
        }
    }

    function describeMultiTokenTests() {
        describe("token = ltToken", function () {
            beforeEach(async () => {
                token = ltToken;
            });

            describeSingleTokenTests();
        });

        describe("token = gtToken", function () {
            beforeEach(async () => {
                token = gtToken;
            });

            describeSingleTokenTests();
        });
    }

    describe("token decimals = 18, quoteToken decimals = 18", function () {
        beforeEach(async () => {
            await ltToken.setDecimals(18);
            await gtToken.setDecimals(18);
            await quoteToken.setDecimals(18);
        });

        describeMultiTokenTests();
    });

    describe("token decimals = 6, quoteToken decimals = 18", function () {
        beforeEach(async () => {
            await ltToken.setDecimals(6);
            await gtToken.setDecimals(6);
            await quoteToken.setDecimals(18);
        });

        describeMultiTokenTests();
    });

    describe("token decimals = 18, quoteToken decimals = 6", function () {
        beforeEach(async () => {
            await ltToken.setDecimals(18);
            await gtToken.setDecimals(18);
            await quoteToken.setDecimals(6);
        });

        describeMultiTokenTests();
    });

    describe("token decimals = 6, quoteToken decimals = 6", function () {
        beforeEach(async () => {
            await ltToken.setDecimals(6);
            await gtToken.setDecimals(6);
            await quoteToken.setDecimals(6);
        });

        describeMultiTokenTests();
    });
});

describe("UniswapV3Oracle#isContract", function () {
    var oracle;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");

        oracle = await oracleFactory.deploy(
            AddressZero,
            AddressZero,
            uniswapV3InitCodeHash,
            [3000],
            AddressZero,
            PERIOD
        );
    });

    it("Should return false for our account address", async () => {
        const [owner] = await ethers.getSigners();

        expect(await oracle.stubIsContract(owner.address)).to.equal(false);
    });

    it("Should return true for a contract address", async () => {
        expect(await oracle.stubIsContract(oracle.address)).to.equal(true);
    });
});

describe("UniswapV3Oracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const oracleFactory = await ethers.getContractFactory("UniswapV3OracleStub");
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");

        oracle = await oracleFactory.deploy(
            AddressZero,
            AddressZero,
            uniswapV3InitCodeHash,
            [3000],
            AddressZero,
            PERIOD
        );
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
