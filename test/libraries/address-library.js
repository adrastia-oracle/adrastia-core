const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AddressLibrary#isContract", function () {
    var aContract;
    var lib;

    beforeEach(async () => {
        const erc20Factory = await ethers.getContractFactory("FakeERC20");
        const libFactory = await ethers.getContractFactory("AddressLibraryStub");

        aContract = await erc20Factory.deploy("Token", "T", 18);
        await aContract.deployed();

        lib = await libFactory.deploy();
    });

    it("Should return false for our account address", async () => {
        const [owner] = await ethers.getSigners();

        expect(await lib.stubIsContract(owner.address)).to.equal(false);
    });

    it("Should return true for a contract address", async () => {
        expect(await lib.stubIsContract(aContract.address)).to.equal(true);
    });
});
