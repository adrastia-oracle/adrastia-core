const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { ln, exp } = require("@prb/math");
const { fromBn, toBn } = require("evm-bn");

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

function testAveragingStrategy(contractName, deployFunction, calculateWeightedValue, calculateWeightedAverage) {
    describe(contractName, function () {
        var averaging;
        var mathUtil;

        beforeEach(async function () {
            averaging = await deployFunction();

            const mathUtilFactory = await ethers.getContractFactory("MathUtil");
            mathUtil = await mathUtilFactory.deploy();
        });

        const nFuzz = 10;
        const fuzzBits = [0, 8, 16, 32, 64, 96, 112];

        async function testCalculateWeightedValue(value, weight) {
            const valueCopy = value;
            const weightCopy = weight;
            const expected = await calculateWeightedValue(valueCopy, weightCopy, mathUtil);
            const actual = await averaging.calculateWeightedValue(value, weight);

            const allowedOff = expected.div(1000000); // 0.0001% error allowed

            expect(actual, "Weighted value").to.be.closeTo(expected, allowedOff, "Expected weighted value");
        }

        async function testCalculateWeightedAverage(value, weight) {
            const valueCopy = value;
            const weightCopy = weight;
            const expected = await calculateWeightedAverage(valueCopy, weightCopy, mathUtil);

            if (expected.revertedWith !== undefined) {
                await expect(averaging.calculateWeightedAverage(value, weight)).to.be.revertedWith(
                    expected.revertedWith
                );

                return;
            }

            const actual = await averaging.calculateWeightedAverage(value, weight);

            const allowedOff = expected.result.div(1000000); // 0.0001% error allowed

            expect(actual, "Weighted average").to.be.closeTo(expected.result, allowedOff, "Expected weighted average");
        }

        describe(contractName + "#calculateWeightedValue", function () {
            for (const bits of fuzzBits) {
                describe("Using " + nFuzz + " rounds of fuzzing with " + bits + " bits of randomness", function () {
                    it("Works with both weight and value being random", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = getRandomBigNumber(bits);
                            const weight = getRandomBigNumber(bits);

                            await testCalculateWeightedValue(value, weight);
                        }
                    });

                    it("Works with weight being random and value = 0", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = BigNumber.from(0);
                            const weight = getRandomBigNumber(bits);

                            await testCalculateWeightedValue(value, weight);
                        }
                    });

                    it("Works with weight being random and value = 1", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = BigNumber.from(1);
                            const weight = getRandomBigNumber(bits);

                            await testCalculateWeightedValue(value, weight);
                        }
                    });

                    it("Works with value being random and weight = 0", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = getRandomBigNumber(bits);
                            const weight = BigNumber.from(0);

                            await testCalculateWeightedValue(value, weight);
                        }
                    });

                    it("Works with value being random and weight = 1", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = getRandomBigNumber(bits);
                            const weight = BigNumber.from(1);

                            await testCalculateWeightedValue(value, weight);
                        }
                    });
                });
            }

            it("Works with weight = 0 and value = 0", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(0);
                    const weight = BigNumber.from(0);

                    await testCalculateWeightedValue(value, weight);
                }
            });

            it("Works with weight = 1 and value = 0", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(0);
                    const weight = BigNumber.from(1);

                    await testCalculateWeightedValue(value, weight);
                }
            });

            it("Works with weight = 0 and value = 1", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(1);
                    const weight = BigNumber.from(0);

                    await testCalculateWeightedValue(value, weight);
                }
            });

            it("Works with weight = 1 and value = 1", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(1);
                    const weight = BigNumber.from(1);

                    await testCalculateWeightedValue(value, weight);
                }
            });
        });

        describe(contractName + "#calculateWeightedAverage", function () {
            for (const bits of fuzzBits) {
                describe("Using " + nFuzz + " rounds of fuzzing with " + bits + " bits of randomness", function () {
                    it("Works with both weight and value being random", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = getRandomBigNumber(bits);
                            const weight = getRandomBigNumber(bits);

                            await testCalculateWeightedAverage(value, weight);
                        }
                    });

                    it("Works with weight being random and value = 0", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = BigNumber.from(0);
                            const weight = getRandomBigNumber(bits);

                            await testCalculateWeightedAverage(value, weight);
                        }
                    });

                    it("Works with weight being random and value = 1", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = BigNumber.from(1);
                            const weight = getRandomBigNumber(bits);

                            await testCalculateWeightedAverage(value, weight);
                        }
                    });

                    it("Works with value being random and weight = 0", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = getRandomBigNumber(bits);
                            const weight = BigNumber.from(0);

                            await testCalculateWeightedAverage(value, weight);
                        }
                    });

                    it("Works with value being random and weight = 1", async function () {
                        for (let i = 0; i < nFuzz; i++) {
                            const value = getRandomBigNumber(bits);
                            const weight = BigNumber.from(1);

                            await testCalculateWeightedAverage(value, weight);
                        }
                    });
                });
            }

            it("Works with weight = 0 and value = 0", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(0);
                    const weight = BigNumber.from(0);

                    await testCalculateWeightedAverage(value, weight);
                }
            });

            it("Works with weight = 1 and value = 0", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(0);
                    const weight = BigNumber.from(1);

                    await testCalculateWeightedAverage(value, weight);
                }
            });

            it("Works with weight = 0 and value = 1", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(1);
                    const weight = BigNumber.from(0);

                    await testCalculateWeightedAverage(value, weight);
                }
            });

            it("Works with weight = 1 and value = 1", async function () {
                for (let i = 0; i < nFuzz; i++) {
                    const value = BigNumber.from(1);
                    const weight = BigNumber.from(1);

                    await testCalculateWeightedAverage(value, weight);
                }
            });
        });

        describe(contractName + "#supportsInterface", function () {
            var interfaceIds;

            beforeEach(async function () {
                const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
                interfaceIds = await interfaceIdsFactory.deploy();
            });

            it("Should support IERC165", async function () {
                const interfaceId = await interfaceIds.iERC165();
                expect(await averaging["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });

            it("Should support IAveragingStrategy", async function () {
                const interfaceId = await interfaceIds.iAveragingStrategy();
                expect(await averaging["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
            });
        });
    });
}

async function arithmeticCalculateWeightedValue(value, weight, mathUtil = undefined) {
    return value.mul(weight);
}

async function arithmeticCalculateWeightedAverage(totalWeightedValues, totalWeight, mathUtil = undefined) {
    if (totalWeight.eq(0)) {
        // Weight is 0, so the average is undefined
        return {
            result: undefined,
            revertedWith: "TotalWeightCannotBeZero",
        };
    }

    const result = totalWeightedValues.div(totalWeight);

    return {
        result: result,
        revertedWith: undefined,
    };
}

async function geometricCalculateWeightedValue(value, weight, mathUtil = undefined) {
    if (value.eq(0)) {
        value = BigNumber.from(1);
    }

    return (await mathUtil.ln(value)).mul(weight);
}

async function geometricCalculateWeightedAverage(totalWeightedValues, totalWeight, mathUtil = undefined) {
    if (totalWeight.eq(0)) {
        // Weight is 0, so the average is undefined
        return {
            result: undefined,
            revertedWith: "TotalWeightCannotBeZero",
        };
    }

    const avgIntermediate = totalWeightedValues.div(totalWeight);
    if (avgIntermediate.gte(BigNumber.from("133084258667509499441"))) {
        return {
            result: undefined,
            revertedWith: "PRBMathUD60x18__ExpInputTooBig",
        };
    }

    var result = await mathUtil.exp(avgIntermediate);

    return {
        result: result,
        revertedWith: undefined,
    };
}

async function harmonicCalculateWeightedValue(value, weight, mathUtil = undefined) {
    if (value.eq(0)) {
        value = BigNumber.from(1);
    }

    return weight.div(value);
}

async function harmonicCalculateWeightedAverage(totalWeightedValues, totalWeight, mathUtil = undefined) {
    if (totalWeight.eq(0)) {
        // Weight is 0, so the average is undefined
        return {
            result: undefined,
            revertedWith: "TotalWeightCannotBeZero",
        };
    }

    if (totalWeightedValues.eq(0)) {
        return {
            result: BigNumber.from(0),
            revertedWith: undefined,
        };
    }

    const result = totalWeight.div(totalWeightedValues);

    return {
        result: result,
        revertedWith: undefined,
    };
}

function createHarmonicCalculateWeightedValueFunction(weightShift) {
    return async function harmonicCalculateWeightedValue(value, weight, mathUtil = undefined) {
        if (value.eq(0)) {
            value = BigNumber.from(1);
        }

        const shiftedWeight = await mathUtil.shl(weight, weightShift);

        return shiftedWeight.div(value);
    };
}

function createHarmonicCalculateWeightedAverageFunction(weightShift) {
    return async function harmonicCalculateWeightedAverage(totalWeightedValues, totalWeight, mathUtil = undefined) {
        if (totalWeight.eq(0)) {
            // Weight is 0, so the average is undefined
            return {
                result: undefined,
                revertedWith: "TotalWeightCannotBeZero",
            };
        }

        if (totalWeightedValues.eq(0)) {
            return {
                result: BigNumber.from(0),
                revertedWith: undefined,
            };
        }

        const shiftedTotalWeight = await mathUtil.shl(totalWeight, weightShift);

        const result = shiftedTotalWeight.div(totalWeightedValues);

        return {
            result: result,
            revertedWith: undefined,
        };
    };
}

function createSimpleDeployFunction(contractName) {
    return async function () {
        const contractFactory = await ethers.getContractFactory(contractName);

        const contract = await contractFactory.deploy();

        return contract;
    };
}

testAveragingStrategy(
    "ArithmeticAveraging",
    createSimpleDeployFunction("ArithmeticAveraging"),
    arithmeticCalculateWeightedValue,
    arithmeticCalculateWeightedAverage
);

testAveragingStrategy(
    "GeometricAveraging",
    createSimpleDeployFunction("GeometricAveraging"),
    geometricCalculateWeightedValue,
    geometricCalculateWeightedAverage
);

testAveragingStrategy(
    "HarmonicAveraging",
    createSimpleDeployFunction("HarmonicAveraging"),
    harmonicCalculateWeightedValue,
    harmonicCalculateWeightedAverage
);

testAveragingStrategy(
    "HarmonicAveragingWS80",
    createSimpleDeployFunction("HarmonicAveragingWS80"),
    createHarmonicCalculateWeightedValueFunction(80),
    createHarmonicCalculateWeightedAverageFunction(80)
);

testAveragingStrategy(
    "HarmonicAveragingWS140",
    createSimpleDeployFunction("HarmonicAveragingWS140"),
    createHarmonicCalculateWeightedValueFunction(140),
    createHarmonicCalculateWeightedAverageFunction(140)
);

testAveragingStrategy(
    "HarmonicAveragingWS192",
    createSimpleDeployFunction("HarmonicAveragingWS192"),
    createHarmonicCalculateWeightedValueFunction(192),
    createHarmonicCalculateWeightedAverageFunction(192)
);
