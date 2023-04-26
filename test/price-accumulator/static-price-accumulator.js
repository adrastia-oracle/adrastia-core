const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";

const ZERO_ACCUMULATION = [BigNumber.from(0), 0];

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function createDefaultAccumulator(quoteToken, price, contractName = "StaticPriceAccumulator") {
    const factory = await ethers.getContractFactory(contractName);

    const accumulator = await factory.deploy(quoteToken, price);

    return accumulator;
}

async function createDefaultAccumulatorStub(quoteToken, price, contractName = "StaticPriceAccumulatorStub") {
    return await createDefaultAccumulator(quoteToken, price, contractName);
}

describe("StaticPriceAccumulator#constructor", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    it("Deploys correctly", async function () {
        expect(await accumulator.averagingStrategy()).to.equal(AddressZero);
        expect(await accumulator.quoteToken()).to.equal(quoteToken);

        expect(await accumulator.updateThreshold()).to.not.equal(0);
        expect(await accumulator.updateDelay()).to.not.equal(0);
        expect(await accumulator.heartbeat()).to.not.equal(0);
    });
});

describe("StaticPriceAccumulator#canUpdate", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await accumulator.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false even if the token address is valid", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await accumulator.canUpdate(updateData)).to.equal(false);
    });
});

describe("StaticPriceAccumulator#needsUpdate", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await accumulator.needsUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await accumulator.needsUpdate(updateData)).to.equal(false);
    });

    it("Returns false even if the token address is valid", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await accumulator.needsUpdate(updateData)).to.equal(false);
    });
});

describe("StaticPriceAccumulator#update", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    async function expectNoUpdates(updateData) {
        expect(await accumulator.callStatic.update(updateData)).to.equal(false);

        const tx = await accumulator.update(updateData);
        const receipt = await tx.wait();

        expect(receipt.events).to.be.empty;
    }

    it("Doesn't update if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        await expectNoUpdates(updateData);
    });

    it("Doesn't update if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        await expectNoUpdates(updateData);
    });

    it("Doesn't update even if the token address is valid", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        await expectNoUpdates(updateData);
    });
});

describe("StaticPriceAccumulator#lastUpdateTime", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    it("Returns the current block timestamp for the zero address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await accumulator.lastUpdateTime(updateData)).to.equal(await currentBlockTimestamp());
    });

    it("Returns the current block timestamp for the quote token", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await accumulator.lastUpdateTime(updateData)).to.equal(await currentBlockTimestamp());
    });

    it("Returns the current block timestamp for a valid token", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await accumulator.lastUpdateTime(updateData)).to.equal(await currentBlockTimestamp());
    });
});

describe("StaticPriceAccumulator#timeSinceLastUpdate", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    it("Returns zero for the zero address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await accumulator.timeSinceLastUpdate(updateData)).to.equal(0);
    });

    it("Returns zero for the quote token", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);
        expect(await accumulator.timeSinceLastUpdate(updateData)).to.equal(0);
    });

    it("Returns zero for a valid token", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
        expect(await accumulator.timeSinceLastUpdate(updateData)).to.equal(0);
    });
});

describe("StaticPriceAccumulator#getLastAccumulation", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    it("Returns a valid accumulation for the zero address", async function () {
        const accumulation = [BigNumber.from(0), await currentBlockTimestamp()];
        expect(await accumulator.getLastAccumulation(AddressZero)).to.deep.eq(accumulation);
    });

    it("Returns a valid accumulation for the quote token", async function () {
        const accumulation = [BigNumber.from(0), await currentBlockTimestamp()];
        expect(await accumulator.getLastAccumulation(USDC)).to.deep.eq(accumulation);
    });

    it("Returns a valid accumulation for a valid token", async function () {
        const accumulation = [BigNumber.from(0), await currentBlockTimestamp()];
        expect(await accumulator.getLastAccumulation(GRT)).to.deep.eq(accumulation);
    });
});

describe("StaticPriceAccumulator#getCurrentAccumulation", function () {
    var accumulator;
    var quoteToken;
    var price;

    beforeEach(async function () {
        quoteToken = USDC;
        price = BigNumber.from(123);

        accumulator = await createDefaultAccumulator(quoteToken, price);
    });

    it("Returns a valid accumulation for the zero address", async function () {
        const accumulation = [BigNumber.from(0), await currentBlockTimestamp()];
        expect(await accumulator.getCurrentAccumulation(AddressZero)).to.deep.eq(accumulation);
    });

    it("Returns a valid accumulation for the quote token", async function () {
        const accumulation = [BigNumber.from(0), await currentBlockTimestamp()];
        expect(await accumulator.getCurrentAccumulation(USDC)).to.deep.eq(accumulation);
    });

    it("Returns a valid accumulation for a valid token", async function () {
        const accumulation = [BigNumber.from(0), await currentBlockTimestamp()];
        expect(await accumulator.getCurrentAccumulation(GRT)).to.deep.eq(accumulation);
    });
});

describe("StaticPriceAccumulator#calculatePrice", function () {
    const prices = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2), ethers.utils.parseUnits("1.0", 18)];

    for (const price of prices) {
        it(`Returns price=${price.toString()}`, async function () {
            const accumulator = await createDefaultAccumulator(USDC, price);
            expect(await accumulator.calculatePrice(ZERO_ACCUMULATION, ZERO_ACCUMULATION)).to.equal(price);
        });
    }
});

describe("StaticPriceAccumulator#consultPrice(token)", function () {
    const tokens = [AddressZero, USDC, GRT];
    const prices = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2), ethers.utils.parseUnits("1.0", 18)];

    for (const token of tokens) {
        describe("token = " + token.toString(), function () {
            for (const price of prices) {
                it(`Returns ${price.toString()} for the zero address`, async function () {
                    const accumulator = await createDefaultAccumulator(token, price);
                    expect(await accumulator["consultPrice(address)"](token)).to.equal(price);
                });
            }
        });
    }
});

describe("StaticPriceAccumulator#consultPrice(token, maxAge = 0)", function () {
    const tokens = [AddressZero, USDC, GRT];
    const prices = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2), ethers.utils.parseUnits("1.0", 18)];

    for (const token of tokens) {
        describe("token = " + token.toString(), function () {
            for (const price of prices) {
                it(`Returns ${price.toString()} for the zero address`, async function () {
                    const accumulator = await createDefaultAccumulator(token, price);
                    expect(await accumulator["consultPrice(address,uint256)"](token, 0)).to.equal(price);
                });
            }
        });
    }
});

describe("StaticPriceAccumulator#consultPrice(token, maxAge = 1)", function () {
    const tokens = [AddressZero, USDC, GRT];
    const prices = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2), ethers.utils.parseUnits("1.0", 18)];

    for (const token of tokens) {
        describe("token = " + token.toString(), function () {
            for (const price of prices) {
                it(`Returns ${price.toString()} for the zero address`, async function () {
                    const accumulator = await createDefaultAccumulator(token, price);
                    expect(await accumulator["consultPrice(address,uint256)"](token, 1)).to.equal(price);
                });
            }
        });
    }
});

describe("StaticPriceAccumulator#fetchPrice", function () {
    const tokens = [AddressZero, USDC, GRT];
    const prices = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2), ethers.utils.parseUnits("1.0", 18)];

    for (const token of tokens) {
        describe("token = " + token.toString(), function () {
            for (const price of prices) {
                it(`Returns ${price.toString()} for the zero address`, async function () {
                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);
                    const accumulator = await createDefaultAccumulatorStub(token, price);
                    expect(await accumulator.stubFetchPrice(updateData)).to.equal(price);
                });
            }
        });
    }
});
