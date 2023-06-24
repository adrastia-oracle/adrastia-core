const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function main() {
    const token = "0x0000000000000000000000000000000000000001";
    const quoteToken = ethers.constants.AddressZero;
    const updateTheshold = 25000000; // 25% change -> update
    const minUpdateDelay = 1; // At most one update every second
    const maxUpdateDelay = 1 * 60 * 60; // At most (optimistically) 1 hour between every update

    const period = 60 * 60; // 1 hour TWAP
    const granularity = 4; // Updates every 15 minutes

    const staticTokenLiquidity = 2;
    const staticQuoteTokenLiquidity = 2;
    const liquidityDecimals = 0;

    const priceAveragingStrategy = await createContract("GeometricAveraging");

    const accumulator = await createContract(
        "OffchainPriceAccumulator",
        priceAveragingStrategy.address,
        quoteToken,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    console.log("Offchain price accumulator deployed at " + accumulator.address);

    const oracle = await createContract(
        "PeriodicPriceAccumulationOracle",
        accumulator.address,
        quoteToken,
        period,
        granularity,
        staticTokenLiquidity,
        staticQuoteTokenLiquidity,
        liquidityDecimals
    );

    console.log("Periodic price accumulation oracle deployed at " + oracle.address);

    var lastCurrentPrice = BigNumber.from(0);
    var startTime = await currentBlockTimestamp();
    var changes = 0;

    await sleep(20000);

    while (true) {
        await sleep(3000);

        try {
            const consultPrice = await accumulator["consultPrice(address)"](token);
            const formattedPrice = ethers.utils.commify(ethers.utils.formatUnits(consultPrice, "gwei"));

            console.log("\u001b[" + 93 + "m" + "Current price = " + formattedPrice + "\u001b[0m");

            if (!consultPrice.eq(lastCurrentPrice)) {
                lastCurrentPrice = consultPrice;
                ++changes;
            }
        } catch (e) {
            console.log(e);
        }

        try {
            const consultPrice = await oracle["consultPrice(address)"](token);
            const formattedPrice = ethers.utils.commify(ethers.utils.formatUnits(consultPrice, "gwei"));

            console.log("\u001b[" + 93 + "m" + "Average price = " + formattedPrice + "\u001b[0m");
        } catch (e) {
            console.log(e);
        }

        const currentTime = await currentBlockTimestamp();
        if (changes > 0 && currentTime > startTime) {
            // Calculate changes per hour
            const changesPerHour = changes / ((currentTime - startTime) / 3600);

            // Log total changes and changes per hour
            console.log("\u001b[" + 93 + "m" + "Changes = " + changes + "\u001b[0m");
            console.log("\u001b[" + 93 + "m" + "Changes per hour = " + changesPerHour + "\u001b[0m");

            // Log time running in the color blue
            console.log("\u001b[" + 94 + "m" + "Time running = " + (currentTime - startTime) + "\u001b[0m");
        }

        // Keep mining blocks so that block.timestamp updates
        await hre.network.provider.send("evm_mine");
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
