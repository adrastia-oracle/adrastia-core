const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

const DEFAULT_CONFIDENCE_DECIMALS = 8;
const DEFAULT_MIN_CONFIDENCE = ethers.utils.parseUnits("0.95", DEFAULT_CONFIDENCE_DECIMALS); // 95%
const LOWEST_CONFIDENCE_INTERVAL = ethers.constants.One;

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function deployChainlinkFeed(quoteTokenDecimals) {
    const feedFactory = await ethers.getContractFactory("ChainlinkFeedStub");
    const feed = await feedFactory.deploy(quoteTokenDecimals, "Feed", 1);
    await feed.deployed();

    return feed;
}

async function createDefaultChainlinkOracle(feedToken, quoteToken, contractName = "ChainlinkOracleView") {
    const quoteTokenContract = await ethers.getContractAt(
        "@openzeppelin-v4/contracts/token/ERC20/ERC20.sol:ERC20",
        quoteToken
    );
    const quoteTokenDecimals = await quoteTokenContract.decimals();

    const feed = await deployChainlinkFeed(quoteTokenDecimals);

    const factory = await ethers.getContractFactory(contractName);
    const oracle = await factory.deploy(feed.address, feedToken, quoteToken);

    return {
        feed: feed,
        oracle: oracle,
    };
}

function pythFeedId(feedToken) {
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(feedToken));
}

async function deployPythFeed(quoteTokenDecimals, feedId) {
    const feedFactory = await ethers.getContractFactory("PythFeedStub");
    const feed = await feedFactory.deploy(feedId, quoteTokenDecimals);
    await feed.deployed();

    return feed;
}

async function createDefaultPythOracle(feedToken, quoteToken, contractName = "PythOracleView", overrides = {}) {
    const quoteTokenContract = await ethers.getContractAt(
        "@openzeppelin-v4/contracts/token/ERC20/ERC20.sol:ERC20",
        quoteToken
    );
    const quoteTokenDecimals = await quoteTokenContract.decimals();

    // Create some feed ID based on the feed token
    const feedId = pythFeedId(feedToken);

    let feedAddress = overrides.feedAddress;
    let feed = undefined;
    if (!feedAddress) {
        feed = await deployPythFeed(quoteTokenDecimals, feedId);
        feedAddress = feed.address;
    }

    let minConfidence = overrides.minConfidence;
    if (minConfidence == null) {
        minConfidence = DEFAULT_MIN_CONFIDENCE;
    }

    const factory = await ethers.getContractFactory(contractName ?? "PythOracleView");
    const oracle = await factory.deploy(feedAddress, feedId, feedToken, minConfidence, quoteToken);

    return {
        feed: feed,
        oracle: oracle,
    };
}

async function deployDiaFeed(quoteTokenDecimals, feedId) {
    const feedFactory = await ethers.getContractFactory("DiaFeedStub");
    const feed = await feedFactory.deploy(feedId, quoteTokenDecimals);
    await feed.deployed();

    return feed;
}

async function createDefaultDiaOracle(feedToken, quoteToken, contractName = "DiaOracleView", overrides = {}) {
    const quoteTokenContract = await ethers.getContractAt(
        "@openzeppelin-v4/contracts/token/ERC20/ERC20.sol:ERC20",
        quoteToken
    );
    const quoteTokenDecimals = await quoteTokenContract.decimals();

    // Create some feed ID based on the feed token
    const feedId = pythFeedId(feedToken);

    let feedAddress = overrides.feedAddress;
    let feed = undefined;
    if (!feedAddress) {
        feed = await deployDiaFeed(quoteTokenDecimals, feedId);
        feedAddress = feed.address;
    }

    const factory = await ethers.getContractFactory(contractName ?? "DiaOracleView");
    const oracle = await factory.deploy(feedAddress, feedId, feedToken, quoteTokenDecimals, quoteToken);

    return {
        feed: feed,
        oracle: oracle,
    };
}

describe("ChainlinkOracleView#constructor", function () {
    it("Deploys correctly with USDC as the quote token (6 decimals)", async function () {
        const feedToken = GRT;
        const quoteToken = USDC;
        const deployment = await createDefaultChainlinkOracle(feedToken, quoteToken);
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
        const deployment = await createDefaultChainlinkOracle(feedToken, quoteToken);
        const oracle = deployment.oracle;
        const feed = deployment.feed;

        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityDecimals()).to.equal(0);
        expect(await oracle.quoteTokenDecimals()).to.equal(await feed.decimals());
        expect(await oracle.quoteTokenDecimals()).to.equal(18); // Sanity check
    });
});

describe("PythOracleView#constructor", function () {
    it("Deploys correctly with USDC as the quote token (6 decimals)", async function () {
        const feedToken = GRT;
        const quoteToken = USDC;
        const minConfidence = DEFAULT_MIN_CONFIDENCE;
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: minConfidence,
        });
        const oracle = deployment.oracle;
        const feed = deployment.feed;

        const feedId = pythFeedId(feedToken);

        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityDecimals()).to.equal(0);
        expect(await oracle.quoteTokenDecimals()).to.equal(await feed.decimals());
        expect(await oracle.quoteTokenDecimals()).to.equal(6); // Sanity check
        expect(await oracle.getUnderlyingFeedId()).to.equal(feedId);
        expect(await oracle.getFeedToken()).to.equal(feedToken);
        expect(await oracle.getMinConfidence()).to.equal(minConfidence);
    });

    it("Deploys correctly with DAI as the quote token (18 decimals)", async function () {
        const feedToken = GRT;
        const quoteToken = DAI;
        const minConfidence = DEFAULT_MIN_CONFIDENCE;
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: minConfidence,
        });
        const oracle = deployment.oracle;
        const feed = deployment.feed;

        const feedId = pythFeedId(feedToken);

        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityDecimals()).to.equal(0);
        expect(await oracle.quoteTokenDecimals()).to.equal(await feed.decimals());
        expect(await oracle.quoteTokenDecimals()).to.equal(18); // Sanity check
        expect(await oracle.getUnderlyingFeedId()).to.equal(feedId);
        expect(await oracle.getFeedToken()).to.equal(feedToken);
        expect(await oracle.getMinConfidence()).to.equal(minConfidence);
    });

    it("Reverts if the feed address is address(0)", async function () {
        const feedToken = GRT;
        const quoteToken = USDC;
        await expect(
            createDefaultPythOracle(feedToken, quoteToken, undefined, { feedAddress: AddressZero })
        ).to.be.revertedWith("InvalidConstructorArgument");
    });

    it("Reverts if the min confidence is zero", async function () {
        const feedToken = GRT;
        const quoteToken = USDC;
        await expect(
            createDefaultPythOracle(feedToken, quoteToken, undefined, { minConfidence: 0 })
        ).to.be.revertedWith("InvalidConstructorArgument");
    });

    it("Reverts if the feed token is address(0)", async function () {
        const feedToken = AddressZero;
        const quoteToken = USDC;

        await expect(createDefaultPythOracle(feedToken, quoteToken)).to.be.revertedWith("InvalidConstructorArgument");
    });

    it("Reverts if the feed address and feed token are address(0)", async function () {
        const feedToken = AddressZero;
        const quoteToken = USDC;

        await expect(
            createDefaultPythOracle(feedToken, quoteToken, undefined, { feedAddress: AddressZero })
        ).to.be.revertedWith("InvalidConstructorArgument");
    });
});

describe("DiaOracleView#constructor", function () {
    it("Deploys correctly with USDC as the quote token (6 decimals)", async function () {
        const feedToken = GRT;
        const feedTokenDecimals = 6;
        const quoteToken = USDC;
        const deployment = await createDefaultDiaOracle(feedToken, quoteToken);
        const oracle = deployment.oracle;
        const feed = deployment.feed;

        const feedId = pythFeedId(feedToken);

        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityDecimals()).to.equal(0);
        expect(await oracle.quoteTokenDecimals()).to.equal(feedTokenDecimals);
        expect(await oracle.getUnderlyingFeedId()).to.equal(feedId);
        expect(await oracle.getFeedToken()).to.equal(feedToken);
    });

    it("Deploys correctly with DAI as the quote token (18 decimals)", async function () {
        const feedToken = GRT;
        const feedTokenDecimals = 18;
        const quoteToken = DAI;
        const deployment = await createDefaultDiaOracle(feedToken, quoteToken);
        const oracle = deployment.oracle;
        const feed = deployment.feed;

        const feedId = pythFeedId(feedToken);

        expect(await oracle.quoteToken()).to.equal(quoteToken);
        expect(await oracle.liquidityDecimals()).to.equal(0);
        expect(await oracle.quoteTokenDecimals()).to.equal(feedTokenDecimals);
        expect(await oracle.getUnderlyingFeedId()).to.equal(feedId);
        expect(await oracle.getFeedToken()).to.equal(feedToken);
    });

    it("Reverts if the feed address is address(0)", async function () {
        const feedToken = GRT;
        const quoteToken = USDC;
        await expect(
            createDefaultDiaOracle(feedToken, quoteToken, undefined, { feedAddress: AddressZero })
        ).to.be.revertedWith("InvalidConstructorArgument");
    });

    it("Reverts if the feed token is address(0)", async function () {
        const feedToken = AddressZero;
        const quoteToken = USDC;

        await expect(createDefaultDiaOracle(feedToken, quoteToken)).to.be.revertedWith("InvalidConstructorArgument");
    });

    it("Reverts if the feed address and feed token are address(0)", async function () {
        const feedToken = AddressZero;
        const quoteToken = USDC;

        await expect(
            createDefaultDiaOracle(feedToken, quoteToken, undefined, { feedAddress: AddressZero })
        ).to.be.revertedWith("InvalidConstructorArgument");
    });
});

describe("PythOracleView#getLatestObservation - special cases", function () {
    var quoteToken;
    var feedToken;
    var oracle;
    var feed;

    beforeEach(async function () {
        quoteToken = USDC;
        feedToken = GRT;
        const deployment = await createDefaultPythOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;
    });

    async function testWithExpo(wholeTokenPrice, pythExpo, pythConf, answerTooLarge, confidenceTooLow, invalidExpo) {
        const quoteTokenDecimals = await oracle.quoteTokenDecimals();
        const feedId = pythFeedId(feedToken);
        const currentTime = await currentBlockTimestamp();

        const token = feedToken;
        const price = ethers.utils.parseUnits(wholeTokenPrice.toString(), quoteTokenDecimals);

        var scaledPrice;
        if (pythExpo > 0) {
            scaledPrice = wholeTokenPrice.div(BigNumber.from(10).pow(pythExpo));
            // pythPrice = wholeTokenPrice * 10^pythExpo
        } else if (pythExpo < 0) {
            scaledPrice = wholeTokenPrice.mul(BigNumber.from(10).pow(-pythExpo));
            // pythPrice = wholeTokenPrice / 10^(-pythExpo)
        } else {
            // pythExpo == 0
            scaledPrice = wholeTokenPrice;
        }

        if (!wholeTokenPrice.eq(0)) {
            // Sanity check that the test case is valid
            expect(scaledPrice).to.be.not.eq(0);
        }

        await feed.setPrice(feedId, scaledPrice, pythConf, pythExpo, currentTime);

        if (invalidExpo) {
            await expect(oracle.getLatestObservation(token)).to.be.revertedWith("InvalidExponent");
        } else if (answerTooLarge) {
            await expect(oracle.getLatestObservation(token)).to.be.revertedWith("AnswerTooLarge");
        } else if (confidenceTooLow) {
            await expect(oracle.getLatestObservation(token)).to.be.revertedWith("ConfidenceTooLow");
        } else {
            const observation = await oracle.getLatestObservation(token);
            expect(observation.price).to.equal(price);
        }
    }

    it("Returns the correct price when the expo is 0", async function () {
        await testWithExpo(BigNumber.from(12300), 0, 0, false, false, false);
    });

    it("Returns the correct price when the expo is -1", async function () {
        await testWithExpo(BigNumber.from(12300), -1, 0, false, false, false);
    });

    it("Returns the correct price when the expo is 1", async function () {
        await testWithExpo(BigNumber.from(12300), 1, 0, false, false, false);
    });

    it("Returns the correct price when the expo is 11", async function () {
        await testWithExpo(ethers.utils.parseUnits("123", 18), 11, 0, false, false, false);
    });

    it("Returns the correct price when the expo is -11", async function () {
        await testWithExpo(BigNumber.from(12300), -11, 0, false, false, false);
    });

    it("Returns the correct price when the expo is 12", async function () {
        await testWithExpo(ethers.utils.parseUnits("123", 18), 12, 0, false, false, false);
    });

    it("Returns the correct price when the expo is -12", async function () {
        await testWithExpo(BigNumber.from(12300), -12, 0, false, false, false);
    });

    it("Reverts when the expo is -13", async function () {
        await testWithExpo(BigNumber.from(12300), -13, 0, false, false, true);
    });

    it("Reverts when the expo is 13", async function () {
        await testWithExpo(ethers.utils.parseUnits("123", 18), 13, 0, false, false, true);
    });

    it("Reverts when the answer to too large", async function () {
        const tokenFactory = await ethers.getContractFactory("FakeERC20");
        const newQuoteToken = await tokenFactory.deploy("Token", "TOK", 28); // 28 decimals
        await newQuoteToken.deployed();

        quoteToken = newQuoteToken.address;

        const deployment = await createDefaultPythOracle(feedToken, quoteToken);
        oracle = deployment.oracle;
        feed = deployment.feed;

        const quoteTokenDecimals = await oracle.quoteTokenDecimals();

        const largestPrice = BigNumber.from(2).pow(63).sub(1);
        const expo = 0;
        const conf = 0;
        const wholeTokenPrice = largestPrice.mul(BigNumber.from(10).pow(expo));

        const expectedWorkingPrice = ethers.utils.parseUnits(wholeTokenPrice.toString(), quoteTokenDecimals);

        expect(expectedWorkingPrice).to.be.gt(BigNumber.from(2).pow(112).sub(1)); // Sanity check

        await testWithExpo(wholeTokenPrice, expo, conf, true, false, false);
    });

    it("Reverts if the confidence interval is non-zero and the price is zero", async function () {
        const price = BigNumber.from(0);
        const expo = 0;
        const conf = 1;
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, true, false);
    });

    it("Reverts if the confidence interval is greater than the price", async function () {
        const price = BigNumber.from(12300);
        const expo = 0;
        const conf = price.add(1);
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, true, false);
    });

    it("Works if the confidence internal is zero and the price is zero", async function () {
        const price = BigNumber.from(0);
        const expo = 0;
        const conf = 0;
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, false, false);
    });

    it("Reverts if the confidence of a non-zero price is not 100%", async function () {
        //Redeploy
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: ethers.utils.parseUnits("1.0", DEFAULT_CONFIDENCE_DECIMALS),
        });
        oracle = deployment.oracle;
        feed = deployment.feed;

        const price = BigNumber.from(12300);
        const expo = 0;
        const conf = 1;
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, true, false);
    });

    it("Reverts if the confidence of a non-zero low price is not 100%", async function () {
        //Redeploy
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: ethers.utils.parseUnits("1.0", DEFAULT_CONFIDENCE_DECIMALS),
        });
        oracle = deployment.oracle;
        feed = deployment.feed;

        const price = BigNumber.from(1);
        const expo = 0;
        const conf = 1;
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, true, false);
    });

    it("Works if the confidence of a non-zero price is 100%", async function () {
        //Redeploy
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: ethers.utils.parseUnits("1.0", DEFAULT_CONFIDENCE_DECIMALS),
        });
        oracle = deployment.oracle;
        feed = deployment.feed;

        const price = BigNumber.from(12300);
        const expo = 0;
        const conf = 0;
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, false, false);
    });

    it("Works if the confidence of a non-zero low price is 100%", async function () {
        //Redeploy
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: ethers.utils.parseUnits("1.0", DEFAULT_CONFIDENCE_DECIMALS),
        });
        oracle = deployment.oracle;
        feed = deployment.feed;

        const price = BigNumber.from(1);
        const expo = 0;
        const conf = 0;
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, false, false);
    });

    it("Works if the confidence of a non-zero price is 90%", async function () {
        //Redeploy
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: ethers.utils.parseUnits("0.9", DEFAULT_CONFIDENCE_DECIMALS),
        });
        oracle = deployment.oracle;
        feed = deployment.feed;

        const price = BigNumber.from(12300);
        const expo = 0;
        const conf = price.div(10);
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, false, false);
    });

    it("Works if the confidence of a non-zero price is greater than 90%", async function () {
        //Redeploy
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: ethers.utils.parseUnits("0.9", DEFAULT_CONFIDENCE_DECIMALS),
        });
        oracle = deployment.oracle;
        feed = deployment.feed;

        const price = BigNumber.from(12300);
        const expo = 0;
        const conf = price.div(10).sub(1);
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, false, false);
    });

    it("Reverts if the confidence of a non-zero price is less than 90%", async function () {
        //Redeploy
        const deployment = await createDefaultPythOracle(feedToken, quoteToken, undefined, {
            minConfidence: ethers.utils.parseUnits("0.9", DEFAULT_CONFIDENCE_DECIMALS),
        });
        oracle = deployment.oracle;
        feed = deployment.feed;

        const price = BigNumber.from(12300);
        const expo = 0;
        const conf = price.div(10).add(1);
        const wholeTokenPrice = price.mul(BigNumber.from(10).pow(expo));

        await testWithExpo(wholeTokenPrice, expo, conf, false, true, false);
    });
});

function describeTests(contractName, createDefaultOracle, maxPriceBits, priceIsSigned) {
    describe(contractName + "#canUpdate", function () {
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

    describe(contractName + "#needsUpdate", function () {
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

    describe(contractName + "#update", function () {
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

    describe(contractName + "#getLatestObservation", function () {
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

        if (priceIsSigned) {
            it("Reverts if the answer is negative", async function () {
                const token = feedToken;
                const decimals = await feed.decimals();
                await feed.setRoundDataNow(ethers.utils.parseUnits("-3", decimals));
                await expect(oracle.getLatestObservation(token)).to.be.revertedWith("AnswerCannotBeNegative");
            });
        }

        // Prices stored using 112 bits, so we test this boundary
        if (maxPriceBits > 112) {
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
        }

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

        if (maxPriceBits > 112) {
            it("The price is correct when the answer equals 2^112 - 1", async function () {
                const token = feedToken;
                const answer = BigNumber.from(2).pow(112).sub(1);
                await feed.setRoundDataNow(answer);
                const observation = await oracle.getLatestObservation(token);
                expect(observation.price).to.equal(answer);
            });
        } else {
            const maxPow = priceIsSigned ? maxPriceBits - 1 : maxPriceBits;

            it("The price is correct when the answer equals 2^" + maxPow + " - 1", async function () {
                const token = feedToken;
                const answer = BigNumber.from(2).pow(maxPow).sub(1);
                await feed.setRoundDataNow(answer);
                const observation = await oracle.getLatestObservation(token);
                expect(observation.price).to.equal(answer);
            });
        }

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

    describe(contractName + "#consultPrice(token, maxAge = 0)", function () {
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

    describe(contractName + "#consultLiquidity(token, maxAge = 0)", function () {
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

            await expect(oracle["consultLiquidity(address,uint256)"](feedToken, 0)).to.be.revertedWith(
                "InvalidTimestamp"
            );
        });
    });

    describe(contractName + "#consultPrice(token)", function () {
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

    describe(contractName + "#consultLiquidity(token)", function () {
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

    describe(contractName + "#supportsInterface", function () {
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
}

describeTests("ChainlinkOracleView", createDefaultChainlinkOracle, 256, true);
describeTests("PythOracleView", createDefaultPythOracle, 64, true);
describeTests("DiaOracleView", createDefaultDiaOracle, 128, false);
