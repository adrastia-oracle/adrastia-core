const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers, timeAndMine, network } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);

const MAX_BITS = 112;

const TIMESTAMP_STRATEGY_THISBLOCK = 0;
const TIMESTAMP_STRATEGY_EARLIESTOBSERVATION = 1;
const TIMESTAMP_STRATEGY_LATESTOBSERVATION = 2;
const TIMESTAMP_STRATEGY_FIRSTOBSERVATION = 3;
const TIMESTAMP_STRATEGY_LASTOBSERVATION = 4;

const TIMESTAMP_STRATEGIES = [
    TIMESTAMP_STRATEGY_THISBLOCK,
    TIMESTAMP_STRATEGY_EARLIESTOBSERVATION,
    TIMESTAMP_STRATEGY_LATESTOBSERVATION,
    TIMESTAMP_STRATEGY_FIRSTOBSERVATION,
    TIMESTAMP_STRATEGY_LASTOBSERVATION,
];

const TIMESTAMP_STRATEGY_NAMES = [
    "ThisBlock",
    "EarliestObservation",
    "LatestObservation",
    "FirstObservation",
    "LastObservation",
];

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
        aggregator = await aggregatorFactory.deploy(TIMESTAMP_STRATEGY_THISBLOCK);
    });

    it("Should revert if the price exceeds the maximum value", async function () {
        const price = MAX_UINT112.add(1);
        const tokenLiquidity = BigNumber.from(1);
        const quoteTokenLiquidity = BigNumber.from(1);

        await aggregator.stubSetObservation(price, tokenLiquidity, quoteTokenLiquidity, 1);

        await expect(aggregator.aggregateObservations(AddressZero, [], 0, 0)).to.be.revertedWith("PriceTooHigh");
    });
});

describe("AbstractAggregator#validateTimestampStrategy", function () {
    var aggregator;

    beforeEach(async function () {
        const aggregatorFactory = await ethers.getContractFactory("AggregatorStub");
        aggregator = await aggregatorFactory.deploy(TIMESTAMP_STRATEGY_THISBLOCK);
    });

    it("Should revert if the timestamp strategy is not supported", async function () {
        const invalidTimestampStrategy = TIMESTAMP_STRATEGIES[TIMESTAMP_STRATEGIES.length - 1] + 1; // Invalid strategy

        // Either panic (at the time of writing), or revert with a specific error if an additional validation strategy
        // is added to the enum in the future.
        await expect(aggregator.stubValidateTimestampStrategy(invalidTimestampStrategy)).to.be.reverted;
    });

    it("Should not revert when using 'this block' timestamp strategy", async function () {
        await expect(aggregator.stubValidateTimestampStrategy(TIMESTAMP_STRATEGY_THISBLOCK)).to.not.be.reverted;
    });

    it("Should not revert when using 'earliest observation' timestamp strategy", async function () {
        await expect(aggregator.stubValidateTimestampStrategy(TIMESTAMP_STRATEGY_EARLIESTOBSERVATION)).to.not.be
            .reverted;
    });

    it("Should not revert when using 'latest observation' timestamp strategy", async function () {
        await expect(aggregator.stubValidateTimestampStrategy(TIMESTAMP_STRATEGY_LATESTOBSERVATION)).to.not.be.reverted;
    });

    it("Should not revert when using 'first observation' timestamp strategy", async function () {
        await expect(aggregator.stubValidateTimestampStrategy(TIMESTAMP_STRATEGY_FIRSTOBSERVATION)).to.not.be.reverted;
    });

    it("Should not revert when using 'last observation' timestamp strategy", async function () {
        await expect(aggregator.stubValidateTimestampStrategy(TIMESTAMP_STRATEGY_LASTOBSERVATION)).to.not.be.reverted;
    });
});

describe("AbstractAggregator#calculateFinalTimestamp", function () {
    describe("Using 'this block' timestamp strategy", function () {
        let aggregator;

        beforeEach(async function () {
            const aggregatorFactory = await ethers.getContractFactory("AggregatorStub");
            aggregator = await aggregatorFactory.deploy(TIMESTAMP_STRATEGY_THISBLOCK);
        });

        it("Should revert if no timestamps are provided", async function () {
            await expect(aggregator.stubCalculateFinalTimestamp([])).to.be.revertedWith("NoTimestampsProvided");
        });

        it("Should return the current block timestamp", async function () {
            const providedTimestamp = 1;
            const currentTimestamp = await currentBlockTimestamp();
            const finalTimestamp = await aggregator.stubCalculateFinalTimestamp([providedTimestamp]);

            expect(finalTimestamp).to.equal(currentTimestamp);

            // Sanity check
            expect(currentBlockTimestamp).to.not.equal(providedTimestamp);
        });
    });

    describe("Using 'earliest observation' timestamp strategy", function () {
        let aggregator;

        beforeEach(async function () {
            const aggregatorFactory = await ethers.getContractFactory("AggregatorStub");
            aggregator = await aggregatorFactory.deploy(TIMESTAMP_STRATEGY_EARLIESTOBSERVATION);
        });

        it("Should revert if no timestamps are provided", async function () {
            await expect(aggregator.stubCalculateFinalTimestamp([])).to.be.revertedWith("NoTimestampsProvided");
        });

        it("Should return the earliest timestamp", async function () {
            const timestamps = [1, 2, 3];
            const finalTimestamp = await aggregator.stubCalculateFinalTimestamp(timestamps);

            expect(finalTimestamp).to.equal(1);

            const timestamps2 = [3, 2, 1];
            const finalTimestamp2 = await aggregator.stubCalculateFinalTimestamp(timestamps2);

            expect(finalTimestamp2).to.equal(1);

            const timestamps3 = [3, 1];
            const finalTimestamp3 = await aggregator.stubCalculateFinalTimestamp(timestamps3);

            expect(finalTimestamp3).to.equal(1);

            const timestamps4 = [1, 3];
            const finalTimestamp4 = await aggregator.stubCalculateFinalTimestamp(timestamps4);

            expect(finalTimestamp4).to.equal(1);

            const timestamps5 = [2];
            const finalTimestamp5 = await aggregator.stubCalculateFinalTimestamp(timestamps5);

            expect(finalTimestamp5).to.equal(2);
        });
    });

    describe("Using 'latest observation' timestamp strategy", function () {
        let aggregator;

        beforeEach(async function () {
            const aggregatorFactory = await ethers.getContractFactory("AggregatorStub");
            aggregator = await aggregatorFactory.deploy(TIMESTAMP_STRATEGY_LATESTOBSERVATION);
        });

        it("Should revert if no timestamps are provided", async function () {
            await expect(aggregator.stubCalculateFinalTimestamp([])).to.be.revertedWith("NoTimestampsProvided");
        });

        it("Should return the latest timestamp", async function () {
            const timestamps = [1, 2, 3];
            const finalTimestamp = await aggregator.stubCalculateFinalTimestamp(timestamps);

            expect(finalTimestamp).to.equal(3);

            const timestamps2 = [3, 2, 1];
            const finalTimestamp2 = await aggregator.stubCalculateFinalTimestamp(timestamps2);

            expect(finalTimestamp2).to.equal(3);

            const timestamps3 = [3, 1];
            const finalTimestamp3 = await aggregator.stubCalculateFinalTimestamp(timestamps3);

            expect(finalTimestamp3).to.equal(3);

            const timestamps4 = [1, 3];
            const finalTimestamp4 = await aggregator.stubCalculateFinalTimestamp(timestamps4);

            expect(finalTimestamp4).to.equal(3);

            const timestamps5 = [2];
            const finalTimestamp5 = await aggregator.stubCalculateFinalTimestamp(timestamps5);

            expect(finalTimestamp5).to.equal(2);
        });
    });

    describe("Using 'first observation' timestamp strategy", function () {
        let aggregator;

        beforeEach(async function () {
            const aggregatorFactory = await ethers.getContractFactory("AggregatorStub");
            aggregator = await aggregatorFactory.deploy(TIMESTAMP_STRATEGY_FIRSTOBSERVATION);
        });

        it("Should revert if no timestamps are provided", async function () {
            await expect(aggregator.stubCalculateFinalTimestamp([])).to.be.revertedWith("NoTimestampsProvided");
        });

        it("Should return the first timestamp", async function () {
            const timestamps = [1, 2, 3];
            const finalTimestamp = await aggregator.stubCalculateFinalTimestamp(timestamps);

            expect(finalTimestamp).to.equal(1);

            const timestamps2 = [3, 2, 1];
            const finalTimestamp2 = await aggregator.stubCalculateFinalTimestamp(timestamps2);

            expect(finalTimestamp2).to.equal(3);

            const timestamps3 = [3, 1];
            const finalTimestamp3 = await aggregator.stubCalculateFinalTimestamp(timestamps3);

            expect(finalTimestamp3).to.equal(3);

            const timestamps4 = [1, 3];
            const finalTimestamp4 = await aggregator.stubCalculateFinalTimestamp(timestamps4);

            expect(finalTimestamp4).to.equal(1);

            const timestamps5 = [2];
            const finalTimestamp5 = await aggregator.stubCalculateFinalTimestamp(timestamps5);

            expect(finalTimestamp5).to.equal(2);
        });
    });

    describe("Using 'last observation' timestamp strategy", function () {
        let aggregator;

        beforeEach(async function () {
            const aggregatorFactory = await ethers.getContractFactory("AggregatorStub");
            aggregator = await aggregatorFactory.deploy(TIMESTAMP_STRATEGY_LASTOBSERVATION);
        });

        it("Should revert if no timestamps are provided", async function () {
            await expect(aggregator.stubCalculateFinalTimestamp([])).to.be.revertedWith("NoTimestampsProvided");
        });

        it("Should return the last timestamp", async function () {
            const timestamps = [1, 2, 3];
            const finalTimestamp = await aggregator.stubCalculateFinalTimestamp(timestamps);
            expect(finalTimestamp).to.equal(3);

            const timestamps2 = [3, 2, 1];
            const finalTimestamp2 = await aggregator.stubCalculateFinalTimestamp(timestamps2);
            expect(finalTimestamp2).to.equal(1);

            const timestamps3 = [3, 1];
            const finalTimestamp3 = await aggregator.stubCalculateFinalTimestamp(timestamps3);
            expect(finalTimestamp3).to.equal(1);

            const timestamps4 = [1, 3];
            const finalTimestamp4 = await aggregator.stubCalculateFinalTimestamp(timestamps4);
            expect(finalTimestamp4).to.equal(3);

            const timestamps5 = [2];
            const finalTimestamp5 = await aggregator.stubCalculateFinalTimestamp(timestamps5);
            expect(finalTimestamp5).to.equal(2);
        });
    });
});

function bigNumberMin(arr) {
    if (arr.length === 0) {
        throw new Error("Array is empty");
    }

    return arr.reduce((min, current) => (current.lt(min) ? current : min), arr[0]);
}

function bigNumberMax(arr) {
    if (arr.length === 0) {
        throw new Error("Array is empty");
    }

    return arr.reduce((max, current) => (current.gt(max) ? current : max), arr[0]);
}

function testAggregationStrategy(contractName, deployFunction, aggregateObservations) {
    describe(contractName, function () {
        var aggregator;
        var timestampStrategy;

        beforeEach(async function () {
            timestampStrategy = TIMESTAMP_STRATEGY_THISBLOCK; // Default timestamp strategy
            aggregator = await deployFunction(timestampStrategy);
        });

        for (const strategy of TIMESTAMP_STRATEGIES) {
            describe(`Using timestamp strategy ${TIMESTAMP_STRATEGY_NAMES[strategy]}`, function () {
                beforeEach(async function () {
                    timestampStrategy = strategy;
                    aggregator = await deployFunction(timestampStrategy);
                });

                const lengths = [1, 2, 3, 5, 8, 9, 16, 17];
                const nFuzz = 10;
                const fuzzBits = [0, 8, 64, 96, 112];

                async function calculateExpectedTimestamp(from, to, observations) {
                    if (from < 0 || to >= observations.length || from > to) {
                        throw new Error("Invalid range for observations");
                    }

                    if (observations.length === 0) {
                        throw new Error("No observations provided");
                    }

                    // Get the timestamps from the observations in the specified range
                    const timestamps = observations.slice(from, to + 1).map((obs) => obs.data.timestamp);

                    if (timestampStrategy === TIMESTAMP_STRATEGY_THISBLOCK) {
                        // Return the current block timestamp
                        return await currentBlockTimestamp();
                    } else if (timestampStrategy === TIMESTAMP_STRATEGY_EARLIESTOBSERVATION) {
                        // Return the earliest timestamp in the range
                        return bigNumberMin(timestamps);
                    } else if (timestampStrategy === TIMESTAMP_STRATEGY_LATESTOBSERVATION) {
                        // Return the latest timestamp in the range
                        return bigNumberMax(timestamps);
                    } else if (timestampStrategy === TIMESTAMP_STRATEGY_FIRSTOBSERVATION) {
                        // Return the timestamp of the first observation in the range
                        return observations[from].data.timestamp;
                    } else if (timestampStrategy === TIMESTAMP_STRATEGY_LASTOBSERVATION) {
                        // Return the timestamp of the last observation in the range
                        return observations[to].data.timestamp;
                    } else {
                        throw new Error("Unsupported timestamp strategy");
                    }
                }

                async function testObservations(observations, from, to) {
                    // Shallow copy observations
                    const observationsCopy = observations.slice();
                    const expectedObservation = await aggregateObservations(AddressZero, observationsCopy, from, to);
                    if (expectedObservation.revertedWith !== undefined) {
                        await expect(
                            aggregator.aggregateObservations(AddressZero, observations, from, to)
                        ).to.be.revertedWith(expectedObservation.revertedWith);

                        return;
                    }

                    const aggregatedObservation = await aggregator.aggregateObservations(
                        AddressZero,
                        observations,
                        from,
                        to
                    );
                    const expectedTimestamp = await calculateExpectedTimestamp(from, to, observations);

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

                function generateObservation(price, tokenLiquidity, quoteTokenLiquidity, timestamp) {
                    return {
                        metadata: {
                            oracle: AddressZero,
                        },
                        data: {
                            price: price,
                            tokenLiquidity: tokenLiquidity,
                            quoteTokenLiquidity: quoteTokenLiquidity,
                            timestamp: timestamp,
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
                        const timestamp = getRandomBigNumber(32); // 32 bits for timestamp

                        observations.push(generateObservation(price, tokenLiquidity, quoteTokenLiquidity, timestamp));
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

                if (strategy === TIMESTAMP_STRATEGY_THISBLOCK) {
                    describe("[InvalidTimestamp] Reverts if the block timestamp is too large", function () {
                        before(async function () {
                            // Set the timestamp to be very large
                            const timeTooLarge = 2 ** 32; // Overflows uint32 by 1
                            await timeAndMine.setTime(timeTooLarge);
                        });

                        after(async function () {
                            await network.provider.send("hardhat_reset");
                        });

                        it("Reverts when using a single observation with a large timestamp", async function () {
                            const observations = generateRandomObservations(1, MAX_BITS);

                            expect(
                                aggregator.aggregateObservations(AddressZero, observations, 0, 0)
                            ).to.be.revertedWith("InvalidTimestamp");
                        });

                        it("Reverts when using multiple observations with a large timestamp", async function () {
                            const observations = generateRandomObservations(2, MAX_BITS);
                            expect(
                                aggregator.aggregateObservations(AddressZero, observations, 0, 1)
                            ).to.be.revertedWith("InvalidTimestamp");
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
                        aggregator.aggregateObservations(
                            AddressZero,
                            observations,
                            numObservations + 1,
                            numObservations + 1
                        )
                    ).to.be.revertedWith("InsufficientObservations");
                });

                it("Reverts if no observations are provided", async function () {
                    const observations = [];

                    await expect(aggregator.aggregateObservations(AddressZero, observations, 0, 0)).to.be.revertedWith(
                        "InsufficientObservations"
                    );
                });
            });
        }

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
    return async function (timestampStrategy) {
        const contractFactory = await ethers.getContractFactory(contractName);

        const contract = await contractFactory.deploy(timestampStrategy);

        return contract;
    };
}

function createDeployFunctionWithAveraging(contractName, averagingStrategyName) {
    return async function (timestampStrategy) {
        const averagingStrategyFactory = await ethers.getContractFactory(averagingStrategyName);
        const averagingStrategy = await averagingStrategyFactory.deploy();
        await averagingStrategy.deployed();

        const contractFactory = await ethers.getContractFactory(contractName);
        const contract = await contractFactory.deploy(averagingStrategy.address, timestampStrategy);

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
