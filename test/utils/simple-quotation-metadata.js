const { expect } = require("chai");
const { ethers } = require("hardhat");
const AddressZero = ethers.constants.AddressZero;

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const MKR = "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2";

describe("SimpleQuotationMetadata", function () {
    function describeTestsFor(token, name, symbol, decimals) {
        var util;

        beforeEach(async () => {
            const utilFactory = await ethers.getContractFactory("SimpleQuotationMetadata");

            util = await utilFactory.deploy(token);
        });

        it(`quoteTokenName() = "${name}"`, async () => {
            expect(await util.quoteTokenName()).to.equal(name);
        });

        it(`quoteTokenSymbol() = "${symbol}"`, async () => {
            expect(await util.quoteTokenSymbol()).to.equal(symbol);
        });

        it(`quoteTokenDecimals() = ${decimals}`, async () => {
            expect(await util.quoteTokenDecimals()).to.equal(decimals);
        });
    }

    describe("Using USDC", function () {
        describeTestsFor(USDC, "USD Coin", "USDC", 6);
    });

    describe("Using MKR", function () {
        describeTestsFor(MKR, "Maker", "MKR", 18);
    });

    describe("Using a random contract address", function () {
        describeTestsFor("0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95", "", "", 18);
    });
});
