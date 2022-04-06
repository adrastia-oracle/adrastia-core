const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const MaxUint256 = ethers.constants.MaxUint256;

describe("SafeCastExt#toUint112", function () {
    var lib;

    beforeEach(async () => {
        const libFactory = await ethers.getContractFactory("SafeCastExtStub");

        lib = await libFactory.deploy();
    });

    it("Should convert 0 to uint112 without error", async function () {
        expect(await lib.stubToUint112(0)).to.equal(0);
    });

    it("Should convert (2^112)-1 to uint112 without error", async function () {
        const value = BigNumber.from(2).pow(112).sub(1);
        expect(await lib.stubToUint112(value)).to.equal(value);
    });

    it("Should revert with value 2^112", async function () {
        const value = BigNumber.from(2).pow(112);
        await expect(lib.stubToUint112(value)).to.be.reverted;
    });

    it("Should revert with value (2^256)-1", async function () {
        await expect(lib.stubToUint112(MaxUint256)).to.be.reverted;
    });
});
