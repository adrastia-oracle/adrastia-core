const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function createDefaultOracle(feedToken, quoteToken, contractName = "ChainlinkOracleView") {
    const quoteTokenContract = await ethers.getContractAt(
        "@openzeppelin-v4/contracts/token/ERC20/ERC20.sol:ERC20",
        quoteToken
    );
    const quoteTokenDecimals = await quoteTokenContract.decimals();

    const feedFactory = await ethers.getContractFactory("ChainlinkFeedStub");
    const feed = await feedFactory.deploy(quoteTokenDecimals, "Feed", 1);
    await feed.deployed();

    const factory = await ethers.getContractFactory(contractName);
    const oracle = await factory.deploy(feed.address, feedToken, quoteToken);

    return {
        feed: feed,
        oracle: oracle,
    };
}

describe("ChainlinkOracleView#constructor", function () {
    it("Deploys correctly with USDC as the quote token (6 decimals)", async function () {
        const feedToken = GRT;
        const quoteToken = USDC;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        const oracle = deployment.oracle;
        const feed = deployment.feed;

        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityDecimals()).to.equal(0);
        expect(await oracle.quoteTokenDecimals()).to.equal(await feed.decimals());
        expect(await oracle.quoteTokenDecimals()).to.equal(6); // Sanity check
    });

    it("Deploys correctly with DAI as the quote token (18 decimals)", async function () {
        const feedToken = GRT;
        const quoteToken = DAI;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        const oracle = deployment.oracle;
        const feed = deployment.feed;

        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityDecimals()).to.equal(0);
        expect(await oracle.quoteTokenDecimals()).to.equal(await feed.decimals());
        expect(await oracle.quoteTokenDecimals()).to.equal(18); // Sanity check
    });
});

describe("ChainlinkOracleView#canUpdate", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await oracle.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [quoteToken]);
        expect(await oracle.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is valid but the feed is not up-to-date", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [feedToken]);
        expect(await oracle.canUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is valid and the feed is up-to-date", async function () {
        const decimals = await feed.decimals();
        await feed.setRoundDataNow(ethers.utils.parseUnits("3", decimals));

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [feedToken]);
        expect(await oracle.canUpdate(updateData)).to.equal(false);
    });
});

describe("ChainlinkOracleView#needsUpdate", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    it("Returns false if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        expect(await oracle.needsUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [quoteToken]);
        expect(await oracle.needsUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is valid but the feed is not up-to-date", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [feedToken]);
        expect(await oracle.needsUpdate(updateData)).to.equal(false);
    });

    it("Returns false if the token address is valid and the feed is up-to-date", async function () {
        const decimals = await feed.decimals();
        await feed.setRoundDataNow(ethers.utils.parseUnits("3", decimals));

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [feedToken]);
        expect(await oracle.needsUpdate(updateData)).to.equal(false);
    });
});

describe("ChainlinkOracleView#update", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    async function expectNoUpdates(updateData) {
        expect(await oracle.callStatic.update(updateData)).to.equal(false);

        const tx = await oracle.update(updateData);
        const receipt = await tx.wait();

        expect(receipt.events).to.be.empty;
    }

    it("Doesn't update if the token address is zero", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [AddressZero]);
        await expectNoUpdates(updateData);
    });

    it("Doesn't update if the token address is the quote token address", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [quoteToken]);
        await expectNoUpdates(updateData);
    });

    it("Doesn't update if the token address is valid but the feed is not up-to-date", async function () {
        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [feedToken]);
        await expectNoUpdates(updateData);
    });

    it("Doesn't update if the token address is valid and the feed is up-to-date", async function () {
        const decimals = await feed.decimals();
        await feed.setRoundDataNow(ethers.utils.parseUnits("3", decimals));

        var updateData = ethers.utils.defaultAbiCoder.encode(["address"], [feedToken]);
        await expectNoUpdates(updateData);
    });
});

describe("ChainlinkOracleView#getLatestObservation", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    it("Reverts if the token address does not match the feed token address", async function () {
        const token = AddressZero;
        await expect(oracle.getLatestObservation(token)).to.be.revertedWith("UnsupportedToken");
    });

    it("Reverts if the feed's timestamp is zero", async function () {
        const token = feedToken;
        await expect(oracle.getLatestObservation(token)).to.be.revertedWith("InvalidTimestamp");
    });

    it("Reverts if the feed's timestamp equals 2^32", async function () {
        const token = feedToken;
        const decimals = await feed.decimals();
        const timestamp = BigNumber.from(2).pow(32);
        await feed.setRoundData(1, ethers.utils.parseUnits("3", decimals), timestamp, timestamp, 1);
        await expect(oracle.getLatestObservation(token)).to.be.revertedWith("InvalidTimestamp");
    });

    it("Reverts if the feed's timestamp exceeds 2^32", async function () {
        const token = feedToken;
        const decimals = await feed.decimals();
        const timestamp = BigNumber.from(2).pow(32).add(1);
        await feed.setRoundData(1, ethers.utils.parseUnits("3", decimals), timestamp, timestamp, 1);
        await expect(oracle.getLatestObservation(token)).to.be.revertedWith("InvalidTimestamp");
    });

    it("Reverts if the answer is negative", async function () {
        const token = feedToken;
        const decimals = await feed.decimals();
        await feed.setRoundDataNow(ethers.utils.parseUnits("-3", decimals));
        await expect(oracle.getLatestObservation(token)).to.be.revertedWith("AnswerCannotBeNegative");
    });

    it("Reverts if the answer equals 2^112", async function () {
        const token = feedToken;
        const answer = BigNumber.from(2).pow(112);
        await feed.setRoundDataNow(answer);
        await expect(oracle.getLatestObservation(token)).to.be.revertedWith("AnswerTooLarge");
    });

    it("Reverts if the answer exceeds 2^112", async function () {
        const token = feedToken;
        const answer = BigNumber.from(2).pow(112).add(1);
        await feed.setRoundDataNow(answer);
        await expect(oracle.getLatestObservation(token)).to.be.revertedWith("AnswerTooLarge");
    });

    it("The price is correct when the answer is zero", async function () {
        const token = feedToken;
        const answer = BigNumber.from(0);
        await feed.setRoundDataNow(answer);
        const observation = await oracle.getLatestObservation(token);
        expect(observation.price).to.equal(answer);
    });

    it("The price is correct when the answer is one", async function () {
        const token = feedToken;
        const answer = BigNumber.from(1);
        await feed.setRoundDataNow(answer);
        const observation = await oracle.getLatestObservation(token);
        expect(observation.price).to.equal(answer);
    });

    it("The price is correct when the answer equals 2^112 - 1", async function () {
        const token = feedToken;
        const answer = BigNumber.from(2).pow(112).sub(1);
        await feed.setRoundDataNow(answer);
        const observation = await oracle.getLatestObservation(token);
        expect(observation.price).to.equal(answer);
    });

    it("The price is correct when the answer equals a common price (one whole quote token)", async function () {
        const token = feedToken;
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("1", decimals);
        await feed.setRoundDataNow(answer);
        const observation = await oracle.getLatestObservation(token);
        expect(observation.price).to.equal(answer);
    });

    it("The timestamp equals the feed's timestamp", async function () {
        const token = feedToken;
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("1", decimals);
        const timestamp = (await currentBlockTimestamp()) - 100;
        await feed.setRoundData(1, answer, timestamp, timestamp, 1);
        const observation = await oracle.getLatestObservation(token);
        expect(observation.timestamp).to.equal(timestamp);
    });

    it("Token liquidity and quote token liquidity are zero", async function () {
        const token = feedToken;
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("1", decimals);
        await feed.setRoundDataNow(answer);
        const observation = await oracle.getLatestObservation(token);
        expect(observation.tokenLiquidity).to.equal(0);
        expect(observation.quoteTokenLiquidity).to.equal(0);
    });
});

describe("ChainlinkOracleView#consultPrice(token, maxAge = 0)", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    it("Returns the feed's current price", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundDataNow(answer);

        expect(await oracle["consultPrice(address,uint256)"](feedToken, 0)).to.equal(answer);
    });

    it("Returns one whole quote token if the token is the quote token", async function () {
        const decimals = await feed.decimals();

        expect(await oracle["consultPrice(address,uint256)"](quoteToken, 0)).to.equal(
            ethers.utils.parseUnits("1", decimals)
        );
    });

    it("Reverts if the token does not match the feed token", async function () {
        const token = DAI;
        await expect(oracle["consultPrice(address,uint256)"](token, 0)).to.be.revertedWith("UnsupportedToken");
    });

    it("Reverts if the feed's timestamp is zero", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundData(1, answer, 0, 0, 1);

        await expect(oracle["consultPrice(address,uint256)"](feedToken, 0)).to.be.revertedWith("InvalidTimestamp");
    });
});

describe("ChainlinkOracleView#consultLiquidity(token, maxAge = 0)", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    it("Returns zero liquidity for the token and quote token, when the feed has data that describes the token", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundDataNow(answer);

        expect(await oracle["consultLiquidity(address,uint256)"](feedToken, 0)).to.deep.equal([
            ethers.constants.Zero,
            ethers.constants.Zero,
        ]);
    });

    it("Returns zero liquidity for the token and quote token, when the token is the quote token", async function () {
        expect(await oracle["consultLiquidity(address,uint256)"](quoteToken, 0)).to.deep.equal([
            ethers.constants.Zero,
            ethers.constants.Zero,
        ]);
    });

    it("Reverts if the token does not match the feed token", async function () {
        const token = DAI;
        await expect(oracle["consultLiquidity(address,uint256)"](token, 0)).to.be.revertedWith("UnsupportedToken");
    });

    it("Reverts if the feed's timestamp is zero", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundData(1, answer, 0, 0, 1);

        await expect(oracle["consultLiquidity(address,uint256)"](feedToken, 0)).to.be.revertedWith("InvalidTimestamp");
    });
});

describe("ChainlinkOracleView#consultPrice(token)", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    it("Returns the feed's current price", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundDataNow(answer);

        expect(await oracle["consultPrice(address)"](feedToken)).to.equal(answer);
    });

    it("Returns one whole quote token if the token is the quote token", async function () {
        const decimals = await feed.decimals();

        expect(await oracle["consultPrice(address)"](quoteToken)).to.equal(ethers.utils.parseUnits("1", decimals));
    });

    it("Reverts if the token does not match the feed token", async function () {
        const token = DAI;
        await expect(oracle["consultPrice(address)"](token)).to.be.revertedWith("UnsupportedToken");
    });

    it("Reverts if the feed's timestamp is zero", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundData(1, answer, 0, 0, 1);

        await expect(oracle["consultPrice(address)"](feedToken)).to.be.revertedWith("InvalidTimestamp");
    });
});

describe("ChainlinkOracleView#consultLiquidity(token)", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    it("Returns zero liquidity for the token and quote token, when the feed has data that describes the token", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundDataNow(answer);

        expect(await oracle["consultLiquidity(address)"](feedToken)).to.deep.equal([
            ethers.constants.Zero,
            ethers.constants.Zero,
        ]);
    });

    it("Returns zero liquidity for the token and quote token, when the token is the quote token", async function () {
        expect(await oracle["consultLiquidity(address)"](quoteToken)).to.deep.equal([
            ethers.constants.Zero,
            ethers.constants.Zero,
        ]);
    });

    it("Reverts if the token does not match the feed token", async function () {
        const token = DAI;
        await expect(oracle["consultLiquidity(address)"](token)).to.be.revertedWith("UnsupportedToken");
    });

    it("Reverts if the feed's timestamp is zero", async function () {
        const decimals = await feed.decimals();
        const answer = ethers.utils.parseUnits("3", decimals);
        await feed.setRoundData(1, answer, 0, 0, 1);

        await expect(oracle["consultLiquidity(address)"](feedToken)).to.be.revertedWith("InvalidTimestamp");
    });
});

describe("ChainlinkOracleView#supportsInterface", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async function () {
        const deployment = await createDefaultOracle(GRT, USDC);
        oracle = deployment.oracle;
        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IOracle", async () => {
        const interfaceId = await interfaceIds.iOracle();
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
