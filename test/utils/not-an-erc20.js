const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NotAnErc20#constructor", function () {
    var factory;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("NotAnErc20");
    });

    it("Sets the name and symbol", async function () {
        const name = "Token name";
        const symbol = "TKN";

        const notAnErc20 = await factory.deploy(name, symbol, 18);

        expect(await notAnErc20.name()).to.equal(name);
        expect(await notAnErc20.symbol()).to.equal(symbol);
    });

    it("Sets the decimals to 0", async function () {
        const notAnErc20 = await factory.deploy("", "", 0);

        expect(await notAnErc20.decimals()).to.equal(0);
    });

    it("Sets the decimals to 6", async function () {
        const notAnErc20 = await factory.deploy("", "", 6);

        expect(await notAnErc20.decimals()).to.equal(6);
    });

    it("Sets the decimals to 18", async function () {
        const notAnErc20 = await factory.deploy("", "", 18);

        expect(await notAnErc20.decimals()).to.equal(18);
    });
});
