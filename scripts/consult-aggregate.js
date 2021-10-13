// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const ethers = hre.ethers;

const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const uniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const sushiswapFactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const grtAddress = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createUniswapV2Oracle(factory, quoteToken, period) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        "UniswapV2LiquidityAccumulator",
        factory,
        quoteToken,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    return await createContract("UniswapV2Oracle", liquidityAccumulator.address, factory, quoteToken, period);
}

async function createUniswapV3Oracle(factory, quoteToken, period) {
    return await createContract("UniswapV3Oracle", factory, quoteToken, period);
}

async function createAggregatedOracle(period, ...oracles) {
    return await createContract("AggregatedOracle", oracles, period);
}

async function main() {
    const token = wethAddress;
    const quoteToken = usdcAddress;

    const underlyingPeriodSeconds = 5;
    const periodSeconds = 10;

    const uniswapV2Oracle = await createUniswapV2Oracle(uniswapV2FactoryAddress, quoteToken, underlyingPeriodSeconds);
    const sushiswapOracle = await createUniswapV2Oracle(sushiswapFactoryAddress, quoteToken, underlyingPeriodSeconds);
    const uniswapV3Oracle = await createUniswapV3Oracle(uniswapV3FactoryAddress, quoteToken, underlyingPeriodSeconds);

    const oracle = await createAggregatedOracle(
        periodSeconds,
        uniswapV2Oracle.address,
        sushiswapOracle.address,
        uniswapV3Oracle.address
    );

    while (true) {
        try {
            if (await oracle.needsUpdate(token)) {
                const updateTx = await oracle.update(token);
                const updateReceipt = await updateTx.wait();

                console.log("Oracle updated. Gas used = " + updateReceipt["gasUsed"]);
            }

            const consultation = await oracle["consult(address)"](token);

            console.log("Price =", consultation["price"].toString());
        } catch (e) {
            console.log(e);
        }

        await sleep(1000);

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
