const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

const POLYGON_NIL_PA = "0x0100Dc5a4b099318Ed8a2efACFc1C0e3550dbbEd";
const POLYGON_AVERAGING_GEOMETRIC = "0xF6bfDE89e4848B299e36B91AcF6d327e04C19520";

const ERROR_ZERO = ethers.utils.parseUnits("1.0", 18);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createOracle(averagingStrategy, quoteToken, period, granularity, liquidityDecimals, target) {
    const updateTheshold = ethers.utils.parseUnits("0.05", 8); // 5% (relative) change -> update
    const updateDelay = 60; // 60 seconds
    const heartbeat = 8 * 60 * 60; // 8 hours

    const priceAccumulatorAddress = POLYGON_NIL_PA;

    const liquidityAccumulator = await createContract(
        "AlocUtilizationAndErrorAccumulator",
        target,
        averagingStrategy,
        liquidityDecimals,
        updateTheshold,
        updateDelay,
        heartbeat
    );

    const oracle = await createContract(
        "PeriodicAccumulationOracle",
        liquidityAccumulator.address,
        priceAccumulatorAddress,
        quoteToken,
        period,
        granularity
    );

    return {
        liquidityAccumulator: liquidityAccumulator,
        priceAccumulator: undefined,
        oracle: oracle,
    };
}

async function main() {
    // Periodic oracle parameters
    const period = 24 * 60 * 60; // 24 hours
    const granularity = 2;

    // Accumulator parameters
    const averagingStrategyAddress = POLYGON_AVERAGING_GEOMETRIC;
    const quoteToken = ethers.constants.AddressZero;
    const liquidityDecimals = 8;
    const targetUtilization = ethers.utils.parseUnits("0.9", liquidityDecimals); // 90%

    const oracle = await createOracle(
        averagingStrategyAddress,
        quoteToken,
        period,
        granularity,
        liquidityDecimals,
        targetUtilization
    );

    console.log("Oracle deployed at:", oracle.oracle.address);
    console.log("Liquidity accumulator: ", oracle.liquidityAccumulator.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
