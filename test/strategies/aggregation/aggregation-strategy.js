const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);

const MAX_BITS = 112;

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function getRandomHex(length) {
    let result = "";
    const characters = "0123456789abcdef";
    const charactersLength = characters.length;

    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
}

function getRandomBigNumber(nBits) {
    if (nBits == 0) {
        return BigNumber.from(0);
    }

    const hexLength = nBits / 4; // Each hex digit represents 4 bits
    const randomHexValue = getRandomHex(hexLength);
    const randomValue = BigNumber.from("0x" + randomHexValue);

    return randomValue;
}

describe("AbstractAggregator#prepareResult", function () {
    var aggregator;

    beforeEach(async function () {
        const aggregatorFactory = await ethers.getContractFactory("AggregatorStub");
        aggregator = await aggregatorFactory.deploy();
    });

    it("Should revert if the price exceeds the maximum value", async function () {
        const price = MAX_UINT112.add(1);
        const tokenLiquidity = BigNumber.from(1);
        const quoteTokenLiquidity = BigNumber.from(1);

        await aggregator.stubSetObservation(price, tokenLiquidity, quoteTokenLiquidity);

        await expect(aggregator.aggregateObservations(AddressZero, [], 0, 0)).to.be.revertedWith("PriceTooHigh");
    });
});

function testAggregationStrategy(contractName, deployFunction, aggregateObservations) {
    describe(contractName, function () {
        var aggregator;

        beforeEach(async function () {
            aggregator = await deployFunction();
        });

        const lengths = [1, 2, 3, 4, 5, 8, 9, 16, 17];
        const nFuzz = 10;
        const fuzzBits = [0, 8, 16, 32, 64, 96, 112];

        async function testObservations(observations, from, to) {
            // Shallow copy observations
            const observationsCopy = observations.slice();
            const expectedObservation = await aggregateObservations(AddressZero, observationsCopy, from, to);
            if (expectedObservation.revertedWith !== undefined) {
                await expect(aggregator.aggregateObservations(AddressZero, observations, from, to)).to.be.revertedWith(
                    expectedObservation.revertedWith
                );

                return;
            }

            const aggregatedObservation = await aggregator.aggregateObservations(AddressZero, observations, from, to);
            const expectedTimestamp = await currentBlockTimestamp();

            expect(aggregatedObservation.price, "Aggregated price").to.equal(
                expectedObservation.price,
                "Expected price"
            );
            expect(aggregatedObservation.tokenLiquidity, "Aggregated token liquidity").to.equal(
                expectedObservation.tokenLiquidity,
                "Expected token liquidity"
            );
            expect(aggregatedObservation.quoteTokenLiquidity, "Aggregated quote token liquidity").to.equal(
                expectedObservation.quoteTokenLiquidity,
                "Expected quote token liquidity"
            );
            expect(aggregatedObservation.timestamp, "Aggregated timestamp").to.equal(
                expectedTimestamp,
                "Expected timestamp"
            );
        }

        function generateObservation(price, tokenLiquidity, quoteTokenLiquidity) {
            return {
                metadata: {
                    oracle: AddressZero,
                },
                data: {
                    price: price,
                    tokenLiquidity: tokenLiquidity,
                    quoteTokenLiquidity: quoteTokenLiquidity,
                    timestamp: BigNumber.from(0),
                },
            };
        }

        function generateRandomObservations(num, nBits) {
            var observations = [];

            for (var i = 0; i < num; i++) {
                // Generate a random observation
                const price = getRandomBigNumber(nBits);
                const tokenLiquidity = getRandomBigNumber(nBits);
                const quoteTokenLiquidity = getRandomBigNumber(nBits);

                observations.push(generateObservation(price, tokenLiquidity, quoteTokenLiquidity));
            }

            return observations;
        }

        for (const length of lengths) {
            describe("Aggregates " + length + " observations", function () {
                describe("Using fuzzing", function () {
                    for (const nBits of fuzzBits) {
                        it(
                            "Uses " + nFuzz + " fuzzed observations with " + nBits + " bits of randomness",
                            async function () {
                                for (var j = 0; j < nFuzz; j++) {
                                    const observations = generateRandomObservations(length, nBits);

                                    await testObservations(observations, 0, observations.length - 1);
                                }
                            }
                        );
                    }
                });
            });
        }

        describe("Aggregates 1 observation", function () {
            for (const length of lengths) {
                describe("Using " + length + " observations", function () {
                    it("Uses the first observation", async function () {
                        const observations = generateRandomObservations(length, MAX_BITS);

                        await testObservations(observations, 0, 0);
                    });

                    it("Uses the last observation", async function () {
                        const observations = generateRandomObservations(length, MAX_BITS);

                        await testObservations(observations, observations.length - 1, observations.length - 1);
                    });

                    it("Uses a random observation", async function () {
                        const observations = generateRandomObservations(length, MAX_BITS);

                        const from = Math.floor(Math.random() * observations.length);

                        await testObservations(observations, from, from);
                    });
                });
            }
        });

        it("Reverts if `from` is greater than `to`", async function () {
            const observations = generateRandomObservations(2, MAX_BITS);

            await expect(aggregator.aggregateObservations(AddressZero, observations, 1, 0)).to.be.revertedWith(
                "BadInput"
            );
        });

        it("Reverts if `to` is equal to the number of observations", async function () {
            const numObservations = 2;
            const observations = generateRandomObservations(numObservations, MAX_BITS);

            await expect(
                aggregator.aggregateObservations(AddressZero, observations, 0, numObservations)
            ).to.be.revertedWith("InsufficientObservations");
        });

        it("Reverts if `to` is greater than the number of observations", async function () {
            const numObservations = 2;
            const observations = generateRandomObservations(numObservations, MAX_BITS);

            await expect(
                aggregator.aggregateObservations(AddressZero, observations, 0, numObservations + 1)
            ).to.be.revertedWith("InsufficientObservations");
        });

        it("Reverts if `from` is equal to the number of observations", async function () {
            const numObservations = 2;
            const observations = generateRandomObservations(numObservations, MAX_BITS);

            await expect(
                aggregator.aggregateObservations(AddressZero, observations, numObservations, numObservations)
            ).to.be.revertedWith("InsufficientObservations");
        });

        it("Reverts if `from` is greater than the number of observations", async function () {
            const numObservations = 2;
            const observations = generateRandomObservations(numObservations, MAX_BITS);

            await expect(
                aggregator.aggregateObservations(AddressZero, observations, numObservations + 1, numObservations + 1)
            ).to.be.revertedWith("InsufficientObservations");
        });

        it("Reverts if no observations are provided", async function () {
            const observations = [];

            await expect(aggregator.aggregateObservations(AddressZero, observations, 0, 0)).to.be.revertedWith(
                "InsufficientObservations"
            );
        });

        describe(contractName + "#supportsInterface", function () {
            var interfaceIds;

            beforeEach(async function () {
                const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
                interfaceIds = await interfaceIdsFactory.deploy();
            });

            it("Should support IERC165", async function () {
                const interfaceId = await interfaceIds.iERC165();
                expect(await aggregator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });

            it("Should support IAggregationStrategy", async function () {
                const interfaceId = await interfaceIds.iAggregationStrategy();
                expect(await aggregator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });
        });
    });
}

async function medianAggregateObservations(token, observations, from, to) {
    // Get the observations from index `from` to index `to` (inclusive)
    const observationsToAggregate = observations.slice(from, to + 1);

    // Sort the observations by price
    observationsToAggregate.sort((a, b) => {
        return a.data.price.gt(b.data.price) ? 1 : -1;
    });

    var medianPrice = undefined;

    // Get the median observation.
    if (observationsToAggregate.length % 2 == 1) {
        // If there are an odd number of observations, take the middle one.
        const medianIndex = Math.floor(observationsToAggregate.length / 2);

        medianPrice = observationsToAggregate[medianIndex].data.price;
    } else {
        // If there are an even number of observations, take the average of the two middle ones.
        const medianIndex = observationsToAggregate.length / 2;

        medianPrice = observationsToAggregate[medianIndex - 1].data.price
            .add(observationsToAggregate[medianIndex].data.price)
            .div(2);
    }

    var sumTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.tokenLiquidity),
        BigNumber.from(0)
    );
    var sumQuoteTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.quoteTokenLiquidity),
        BigNumber.from(0)
    );

    if (sumTokenLiquidity.gt(MAX_UINT112)) {
        sumTokenLiquidity = MAX_UINT112;
    }
    if (sumQuoteTokenLiquidity.gt(MAX_UINT112)) {
        sumQuoteTokenLiquidity = MAX_UINT112;
    }

    return {
        price: medianPrice,
        tokenLiquidity: sumTokenLiquidity,
        quoteTokenLiquidity: sumQuoteTokenLiquidity,
        revertedWith: undefined,
    };
}

async function meanAggregateObservations(token, observations, from, to, extractWeight) {
    // Get the observations from index `from` to index `to` (inclusive)
    const observationsToAggregate = observations.slice(from, to + 1);

    var sumWeightedPrice = BigNumber.from(0);
    var sumWeight = BigNumber.from(0);

    for (const observation of observationsToAggregate) {
        const price = observation.data.price;
        const weight = extractWeight(observation.data);

        const weightedPrice = price.mul(weight);

        sumWeightedPrice = sumWeightedPrice.add(weightedPrice);
        sumWeight = sumWeight.add(weight);
    }

    if (sumWeight.eq(0)) {
        return {
            price: BigNumber.from(0),
            tokenLiquidity: BigNumber.from(0),
            quoteTokenLiquidity: BigNumber.from(0),
            revertedWith: "ZeroWeight",
        };
    }

    const price = sumWeightedPrice.div(sumWeight);

    var sumTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.tokenLiquidity),
        BigNumber.from(0)
    );
    var sumQuoteTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.quoteTokenLiquidity),
        BigNumber.from(0)
    );

    if (sumTokenLiquidity.gt(MAX_UINT112)) {
        sumTokenLiquidity = MAX_UINT112;
    }
    if (sumQuoteTokenLiquidity.gt(MAX_UINT112)) {
        sumQuoteTokenLiquidity = MAX_UINT112;
    }

    return {
        price: price,
        tokenLiquidity: sumTokenLiquidity,
        quoteTokenLiquidity: sumQuoteTokenLiquidity,
        revertedWith: undefined,
    };
}

async function minAggregateObservations(token, observations, from, to) {
    // Get the observations from index `from` to index `to` (inclusive)
    const observationsToAggregate = observations.slice(from, to + 1);

    var minPrice = BigNumber.from(2).pow(112).sub(1);

    for (const observation of observationsToAggregate) {
        const price = observation.data.price;
        if (price.lt(minPrice)) {
            minPrice = price;
        }
    }

    var sumTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.tokenLiquidity),
        BigNumber.from(0)
    );
    var sumQuoteTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.quoteTokenLiquidity),
        BigNumber.from(0)
    );

    if (sumTokenLiquidity.gt(MAX_UINT112)) {
        sumTokenLiquidity = MAX_UINT112;
    }
    if (sumQuoteTokenLiquidity.gt(MAX_UINT112)) {
        sumQuoteTokenLiquidity = MAX_UINT112;
    }

    return {
        price: minPrice,
        tokenLiquidity: sumTokenLiquidity,
        quoteTokenLiquidity: sumQuoteTokenLiquidity,
        revertedWith: undefined,
    };
}

async function maxAggregateObservations(token, observations, from, to) {
    // Get the observations from index `from` to index `to` (inclusive)
    const observationsToAggregate = observations.slice(from, to + 1);

    var maxPrice = ethers.constants.Zero;

    for (const observation of observationsToAggregate) {
        const price = observation.data.price;
        if (price.gt(maxPrice)) {
            maxPrice = price;
        }
    }

    var sumTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.tokenLiquidity),
        BigNumber.from(0)
    );
    var sumQuoteTokenLiquidity = observationsToAggregate.reduce(
        (sum, observation) => sum.add(observation.data.quoteTokenLiquidity),
        BigNumber.from(0)
    );

    if (sumTokenLiquidity.gt(MAX_UINT112)) {
        sumTokenLiquidity = MAX_UINT112;
    }
    if (sumQuoteTokenLiquidity.gt(MAX_UINT112)) {
        sumQuoteTokenLiquidity = MAX_UINT112;
    }

    return {
        price: maxPrice,
        tokenLiquidity: sumTokenLiquidity,
        quoteTokenLiquidity: sumQuoteTokenLiquidity,
        revertedWith: undefined,
    };
}

async function tokenWeightedMeanAggregateObservations(token, observations, from, to) {
    return meanAggregateObservations(token, observations, from, to, (data) => data.tokenLiquidity);
}

async function quoteTokenWeightedMeanAggregateObservations(token, observations, from, to) {
    return meanAggregateObservations(token, observations, from, to, (data) => data.quoteTokenLiquidity);
}

async function simpleMeanAggregateObservations(token, observations, from, to) {
    return meanAggregateObservations(token, observations, from, to, () => 1);
}

function createSimpleDeployFunction(contractName) {
    return async function () {
        const contractFactory = await ethers.getContractFactory(contractName);

        const contract = await contractFactory.deploy();

        return contract;
    };
}

function createDeployFunctionWithAveraging(contractName, averagingStrategyName) {
    return async function () {
        const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();

        const contractFactory = await ethers.getContractFactory(contractName);
        const contract = await contractFactory.deploy(averagingStrategy.address);

        return contract;
    };
}

testAggregationStrategy(
    "MedianAggregator",
    createSimpleDeployFunction("MedianAggregator"),
    medianAggregateObservations
);

testAggregationStrategy(
    "TokenWeightedMeanAggregator",
    createDeployFunctionWithAveraging("TokenWeightedMeanAggregator", "ArithmeticAveraging"),
    tokenWeightedMeanAggregateObservations
);

testAggregationStrategy(
    "QuoteTokenWeightedMeanAggregator",
    createDeployFunctionWithAveraging("QuoteTokenWeightedMeanAggregator", "ArithmeticAveraging"),
    quoteTokenWeightedMeanAggregateObservations
);

testAggregationStrategy(
    "MeanAggregator",
    createDeployFunctionWithAveraging("MeanAggregator", "ArithmeticAveraging"),
    simpleMeanAggregateObservations
);

testAggregationStrategy("MinimumAggregator", createSimpleDeployFunction("MinimumAggregator"), minAggregateObservations);

testAggregationStrategy("MaximumAggregator", createSimpleDeployFunction("MaximumAggregator"), maxAggregateObservations);
