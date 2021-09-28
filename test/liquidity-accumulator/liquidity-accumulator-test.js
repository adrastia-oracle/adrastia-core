const { BigNumber } = require("ethers");
const { expect } = require("chai");

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const GRT = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";

const TWO_PERCENT_CHANGE = 2000000;

describe("LiquidityAccumulator#needsUpdate", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    var updateTime;

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
        liquidityAccumulator = await LiquidityAccumulator.deploy(
            USDC,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
        await liquidityAccumulator.deployed();

        // Configure liquidity
        await liquidityAccumulator.setLiquidity(GRT, 100, 100);

        // Override changeThresholdPassed (false)
        await liquidityAccumulator.overrideChangeThresholdPassed(true, false);

        // Time increases by 1 second with each block mined
        await hre.timeAndMine.setTimeIncrease(1);

        // Initial update
        const updateReceipt = await liquidityAccumulator.update(GRT);
        updateTime = (await ethers.provider.getBlock(updateReceipt.blockNumber)).timestamp;
    });

    it("Shouldn't need update if delta time is less than the min update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

        // deltaTime = 1
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);

        // deltaTime = minUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);
    });

    it("Shouldn't need update if delta time is less than the min update delay (update threshold not passed)", async () => {
        // deltaTime = 1
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);

        // deltaTime = minUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);
    });

    it("Should need update if delta time is within min and max update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

        // deltaTime = minUpdateDelay
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);

        // deltaTime = maxUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);
    });

    it("Shouldn't need update if delta time is within min and max update delay (update threshold not passed)", async () => {
        // deltaTime = minUpdateDelay
        await hre.timeAndMine.setTime(updateTime + minUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);

        // deltaTime = maxUpdateDelay - 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay - 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(false);
    });

    it("Should need update if delta time is >= max update delay (update threshold passed)", async () => {
        // changeThresholdPassed = true
        await liquidityAccumulator.overrideChangeThresholdPassed(true, true);

        // deltaTime = maxUpdateDelay
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);

        // deltaTime = maxUpdateDelay + 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);
    });

    it("Should need update if delta time is >= max update delay (update threshold not passed)", async () => {
        // deltaTime = maxUpdateDelay
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);

        // deltaTime = maxUpdateDelay + 1
        await hre.timeAndMine.setTime(updateTime + maxUpdateDelay + 1);
        expect(await liquidityAccumulator.needsUpdate(GRT)).to.equal(true);
    });
});

describe("LiquidityAccumulator#changeThresholdSurpassed", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    const tests = [
        { args: [0, 0, TWO_PERCENT_CHANGE], expected: false },
        { args: [0, 100, TWO_PERCENT_CHANGE], expected: true },
        { args: [100, 0, TWO_PERCENT_CHANGE], expected: true },
        { args: [100, 101, TWO_PERCENT_CHANGE], expected: false },
        { args: [100, 102, TWO_PERCENT_CHANGE], expected: true },
        { args: [100, 103, TWO_PERCENT_CHANGE], expected: true },
        { args: [100, 1000000, TWO_PERCENT_CHANGE], expected: true },
        { args: [101, 100, TWO_PERCENT_CHANGE], expected: false },
        { args: [102, 100, TWO_PERCENT_CHANGE], expected: true },
        { args: [103, 100, TWO_PERCENT_CHANGE], expected: true },
        { args: [1000000, 100, TWO_PERCENT_CHANGE], expected: true },
    ];

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
        liquidityAccumulator = await LiquidityAccumulator.deploy(
            USDC,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
        await liquidityAccumulator.deployed();
    });

    tests.forEach(({ args, expected }) => {
        it(`Should evaluate to ${expected} with liquidities {${args[0]}, ${args[1]}} and update threshold ${args[3]}`, async () => {
            const received = await liquidityAccumulator.harnessChangeThresholdSurpassed(args[0], args[1], args[2]);
            expect(received).to.equal(expected);
        });
    });
});

describe("LiquidityAccumulator#calculateLiquidity", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    const tests = [
        {
            // deltaCumulativeTokenLiquidity = 1
            // deltaCumulativeQuoteTokenLiquidity = 1
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 1, cumulativeQuoteTokenLiquidity: 1, timestamp: 2 },
            ],
            expected: [1, 1],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 1
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 1, timestamp: 2 },
            ],
            expected: [0, 1],
        },
        {
            // deltaCumulativeTokenLiquidity = 1
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 1, cumulativeQuoteTokenLiquidity: 0, timestamp: 2 },
            ],
            expected: [1, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 2 },
            ],
            expected: [0, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 2 },
            ],
            expected: [1000000, 1000000],
        },
        {
            // deltaCumulativeTokenLiquidity = 0
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 2 },
            ],
            expected: [0, 1000000],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 0
            // deltaTime = 1
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 2 },
            ],
            expected: [1000000, 0],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 10
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 1 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 11 },
            ],
            expected: [100000, 100000],
        },
        {
            // deltaCumulativeTokenLiquidity = 1000000
            // deltaCumulativeQuoteTokenLiquidity = 1000000
            // deltaTime = 100000
            args: [
                { cumulativeTokenLiquidity: 1000000, cumulativeQuoteTokenLiquidity: 1000000, timestamp: 100000 },
                { cumulativeTokenLiquidity: 2000000, cumulativeQuoteTokenLiquidity: 2000000, timestamp: 200000 },
            ],
            expected: [10, 10],
        },
        {
            // **Overflow test**
            // deltaCumulativeTokenLiquidity = 10
            // deltaCumulativeQuoteTokenLiquidity = 10
            // deltaTime = 1
            args: [
                {
                    cumulativeTokenLiquidity: ethers.constants.MaxUint256,
                    cumulativeQuoteTokenLiquidity: ethers.constants.MaxUint256,
                    timestamp: 10,
                },
                { cumulativeTokenLiquidity: 9, cumulativeQuoteTokenLiquidity: 9, timestamp: 11 },
            ],
            expected: [10, 10],
        },
    ];

    const revertedWithTests = [
        {
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
            ],
            expected: "LiquidityAccumulator: TIMESTAMP_CANNOT_BE_ZERO",
        },
        {
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
            ],
            expected: "LiquidityAccumulator: TIMESTAMP_CANNOT_BE_ZERO",
        },
        {
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
            ],
            expected: "LiquidityAccumulator: DELTA_TIME_CANNOT_BE_ZERO",
        },
        {
            args: [
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 1 },
                { cumulativeTokenLiquidity: 0, cumulativeQuoteTokenLiquidity: 0, timestamp: 0 },
            ],
            expected: false, // Subtraction underflow
        },
    ];

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
        liquidityAccumulator = await LiquidityAccumulator.deploy(
            USDC,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
        await liquidityAccumulator.deployed();
    });

    tests.forEach(({ args, expected }) => {
        it(`Should evaluate to ${expected} using accumulations {${JSON.stringify(args[0])}, ${JSON.stringify(
            args[1]
        )}}`, async () => {
            const received = await liquidityAccumulator.calculateLiquidity(args[0], args[1]);
            expect(received[0]).to.equal(expected[0]);
            expect(received[1]).to.equal(expected[1]);
        });
    });

    revertedWithTests.forEach(({ args, expected }) => {
        it(`Should revert${expected ? " with " + expected : ""} using accumulations {${JSON.stringify(
            args[0]
        )}, ${JSON.stringify(args[1])}}`, async () => {
            if (expected)
                await expect(liquidityAccumulator.calculateLiquidity(args[0], args[1])).to.be.revertedWith(expected);
            else await expect(liquidityAccumulator.calculateLiquidity(args[0], args[1])).to.be.reverted;
        });
    });
});

describe("LiquidityAccumulator#update", () => {
    const minUpdateDelay = 10000;
    const maxUpdateDelay = 30000;

    var liquidityAccumulator;

    const initialUpdateTests = [
        /* Basic tests w/ no liquidity setting */
        {
            args: {
                initialLiquidity: false,
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: false,
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        /* Tests without overrides */
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("200"),
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("200"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.constants.MaxUint256,
                    quoteToken: ethers.constants.MaxUint256,
                },
            },
            expectedReturn: true,
        },
        /* Tests with overrides - needsUpdate = false */
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("200"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("200"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.constants.MaxUint256,
                    quoteToken: ethers.constants.MaxUint256,
                },
                overrideNeedsUpdate: {
                    needsUpdate: false,
                },
            },
            expectedReturn: false,
        },
        /* Tests with overrides - needsUpdate = true */
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("200"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("200"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.constants.MaxUint256,
                    quoteToken: ethers.constants.MaxUint256,
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
    ];

    const secondUpdateTests = [
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("0"),
                    quoteToken: ethers.utils.parseEther("0"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("50"),
                    quoteToken: ethers.utils.parseEther("50"),
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("50"),
                    quoteToken: ethers.utils.parseEther("50"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            args: {
                initialLiquidity: {
                    token: ethers.utils.parseEther("25"),
                    quoteToken: ethers.utils.parseEther("50"),
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("75"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
        {
            // ** Overflow test **
            args: {
                initialLiquidity: {
                    token: ethers.constants.MaxUint256,
                    quoteToken: ethers.constants.MaxUint256,
                },
                secondLiquidity: {
                    token: ethers.utils.parseEther("100"),
                    quoteToken: ethers.utils.parseEther("100"),
                },
                overrideNeedsUpdate: {
                    needsUpdate: true,
                },
            },
            expectedReturn: true,
        },
    ];

    beforeEach(async () => {
        const LiquidityAccumulator = await ethers.getContractFactory("LiquidityAccumulatorHarness");
        liquidityAccumulator = await LiquidityAccumulator.deploy(
            USDC,
            TWO_PERCENT_CHANGE,
            minUpdateDelay,
            maxUpdateDelay
        );
        await liquidityAccumulator.deployed();
    });

    async function verifyUpdate(expectedReturn, initialLiquidity, secondLiquidity = undefined, firstUpdateTime = 0) {
        const firstAccumulation = await liquidityAccumulator.getAccumulation(GRT);

        expect(await liquidityAccumulator.callStatic.update(GRT)).to.equal(expectedReturn);

        const receipt = await liquidityAccumulator.update(GRT);
        await receipt.wait();

        const updateTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

        const accumulation = await liquidityAccumulator.getAccumulation(GRT);
        const observation = await liquidityAccumulator.getLastObservation(GRT);

        var expectedCumulativeTokenLiquidity = 0;
        var expectedCumulativeQuoteTokenLiquidity = 0;

        var expectedTokenLiquidity = 0;
        var expectedQuoteTokenLiquidity = 0;

        var expectedTimestamp = 0;

        if (secondLiquidity) {
            // Verifying a second update

            if (expectedReturn) {
                // An update should have occurred

                const secondAccumulation = await liquidityAccumulator.getAccumulation(GRT);

                const liquidityFromAccumulation = await liquidityAccumulator.calculateLiquidity(
                    firstAccumulation,
                    secondAccumulation
                );

                const deltaTime = updateTime - firstUpdateTime;

                // Calculate cumulatives
                expectedCumulativeTokenLiquidity = BigNumber.from(initialLiquidity["token"]).add(
                    BigNumber.from(BigNumber.from(secondLiquidity["token"]).mul(BigNumber.from(deltaTime)))
                );
                expectedCumulativeQuoteTokenLiquidity = BigNumber.from(initialLiquidity["quoteToken"]).add(
                    BigNumber.from(BigNumber.from(secondLiquidity["quoteToken"]).mul(BigNumber.from(deltaTime)))
                );

                // Process overflows
                while (expectedCumulativeTokenLiquidity.gt(ethers.constants.MaxUint256)) {
                    expectedCumulativeTokenLiquidity = expectedCumulativeTokenLiquidity.sub(
                        ethers.constants.MaxUint256.add(1) // = 2e256
                    );
                }
                while (expectedCumulativeQuoteTokenLiquidity.gt(ethers.constants.MaxUint256)) {
                    expectedCumulativeQuoteTokenLiquidity = expectedCumulativeQuoteTokenLiquidity.sub(
                        ethers.constants.MaxUint256.add(1) // = 2e256
                    );
                }

                expectedTokenLiquidity = secondLiquidity["token"];
                expectedQuoteTokenLiquidity = secondLiquidity["quoteToken"];

                expectedTimestamp = updateTime;

                // Verify liquidity from accumulations is correct
                expect(liquidityFromAccumulation["tokenLiquidity"]).to.equal(expectedTokenLiquidity);
                expect(liquidityFromAccumulation["quoteTokenLiquidity"]).to.equal(expectedQuoteTokenLiquidity);
            } else {
                // No update should have occurred => use last values

                expectedCumulativeTokenLiquidity = initialLiquidity["token"] ?? 0;
                expectedCumulativeQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                expectedTokenLiquidity = initialLiquidity["token"] ?? 0;
                expectedQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                expectedTimestamp = firstUpdateTime;
            }
        } else {
            // Verifying initial update

            if (expectedReturn) {
                // An update should have occurred

                expectedCumulativeTokenLiquidity = initialLiquidity["token"] ?? 0;
                expectedCumulativeQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                expectedTokenLiquidity = initialLiquidity["token"] ?? 0;
                expectedQuoteTokenLiquidity = initialLiquidity["quoteToken"] ?? 0;

                expectedTimestamp = updateTime;
            }
        }

        expect(accumulation["cumulativeTokenLiquidity"]).to.equal(expectedCumulativeTokenLiquidity);
        expect(accumulation["cumulativeQuoteTokenLiquidity"]).to.equal(expectedCumulativeQuoteTokenLiquidity);
        expect(accumulation["timestamp"]).to.equal(expectedTimestamp);

        expect(observation["tokenLiquidity"]).to.equal(expectedTokenLiquidity);
        expect(observation["quoteTokenLiquidity"]).to.equal(expectedQuoteTokenLiquidity);
        expect(observation["timestamp"]).to.equal(expectedTimestamp);
    }

    initialUpdateTests.forEach(({ args, expectedReturn }) => {
        it(`${expectedReturn ? "Should" : "Shouldn't"} update (initial) using args ${JSON.stringify(
            args
        )}`, async () => {
            if (args["initialLiquidity"]) {
                // Configure liquidity
                await (
                    await liquidityAccumulator.setLiquidity(
                        GRT,
                        args["initialLiquidity"]["token"],
                        args["initialLiquidity"]["quoteToken"]
                    )
                ).wait();
            }

            if (args["overrideNeedsUpdate"]) {
                // Override needsUpdate
                await (
                    await liquidityAccumulator.overrideNeedsUpdate(true, args["overrideNeedsUpdate"]["needsUpdate"])
                ).wait();
            }

            await verifyUpdate(expectedReturn, args["initialLiquidity"]);
        });
    });

    secondUpdateTests.forEach(({ args, expectedReturn }) => {
        it(`${expectedReturn ? "Should" : "Shouldn't"} update using args ${JSON.stringify(args)}`, async () => {
            // Configure initial liquidity
            await (
                await liquidityAccumulator.setLiquidity(
                    GRT,
                    args["initialLiquidity"]["token"],
                    args["initialLiquidity"]["quoteToken"]
                )
            ).wait();

            // Initial update
            const receipt = await liquidityAccumulator.update(GRT);
            await receipt.wait();

            const updateTime = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;

            // Configure liquidity
            await (
                await liquidityAccumulator.setLiquidity(
                    GRT,
                    args["secondLiquidity"]["token"],
                    args["secondLiquidity"]["quoteToken"]
                )
            ).wait();

            if (args["overrideNeedsUpdate"]) {
                // Override needsUpdate
                await (
                    await liquidityAccumulator.overrideNeedsUpdate(true, args["overrideNeedsUpdate"]["needsUpdate"])
                ).wait();
            }

            await verifyUpdate(expectedReturn, args["initialLiquidity"], args["secondLiquidity"], updateTime);
        });
    });

    it("Shouldn't update when deltaTime = 0", async () => {
        // Configure initial liquidity
        const initialTokenLiquidity = ethers.utils.parseEther("100");
        const initialQuoteTokenLiquidity = ethers.utils.parseEther("100");
        await (await liquidityAccumulator.setLiquidity(GRT, initialTokenLiquidity, initialQuoteTokenLiquidity)).wait();

        // Override needsUpdate
        await (await liquidityAccumulator.overrideNeedsUpdate(true, true)).wait();

        // Initial update
        const initialUpdateReceipt = await liquidityAccumulator.update(GRT);
        await initialUpdateReceipt.wait();
        const initialUpdateTime = (await ethers.provider.getBlock(initialUpdateReceipt.blockNumber)).timestamp;

        // Configure liquidity(1)
        const firstTokenLiquidity = ethers.utils.parseEther("101");
        const firstQuoteTokenLiquidity = ethers.utils.parseEther("101");
        await (await liquidityAccumulator.setLiquidity(GRT, firstTokenLiquidity, firstQuoteTokenLiquidity)).wait();

        // Disable automining
        await ethers.provider.send("evm_setAutomine", [false]);

        try {
            // Perform update(1)
            const firstUpdateReceipt = await liquidityAccumulator.update(GRT);

            // Configure liquidity(2)
            const updateLiquidityReceipt = await liquidityAccumulator.setLiquidity(
                GRT,
                ethers.utils.parseEther("102"),
                ethers.utils.parseEther("102")
            );

            // Perform update(2)
            const secondUpdateReceipt = await liquidityAccumulator.update(GRT);

            // Mine the transactions
            await ethers.provider.send("evm_mine");

            // Wait for transactions to be mined
            await firstUpdateReceipt.wait();
            await updateLiquidityReceipt.wait();
            await secondUpdateReceipt.wait();

            const firstUpdateTime = (await ethers.provider.getBlock(firstUpdateReceipt.blockNumber)).timestamp;

            const deltaTime = firstUpdateTime - initialUpdateTime;

            const expectedCumulativeTokenLiquidity = initialTokenLiquidity.add(
                firstTokenLiquidity.mul(BigNumber.from(deltaTime))
            );
            const expectedCumulativeQuoteTokenLiquidity = initialQuoteTokenLiquidity.add(
                firstQuoteTokenLiquidity.mul(BigNumber.from(deltaTime))
            );

            const accumulation = await liquidityAccumulator.getAccumulation(GRT);
            const observation = await liquidityAccumulator.getLastObservation(GRT);

            expect(accumulation["cumulativeTokenLiquidity"]).to.equal(expectedCumulativeTokenLiquidity);
            expect(accumulation["cumulativeQuoteTokenLiquidity"]).to.equal(expectedCumulativeQuoteTokenLiquidity);

            expect(observation["tokenLiquidity"]).to.equal(firstTokenLiquidity);
            expect(observation["quoteTokenLiquidity"]).to.equal(firstQuoteTokenLiquidity);
        } finally {
            // Re-enable automining
            await ethers.provider.send("evm_setAutomine", [true]);
        }
    });
});
