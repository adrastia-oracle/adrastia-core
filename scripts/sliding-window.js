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

    const liquidityOracle = await createContract(
        "TwapLiquidityOracle",
        liquidityAccumulator.address,
        quoteToken,
        period
    );

    const priceOracle = await createContract("UniswapV2PriceOracle", factory, quoteToken, period);

    const oracle = await createContract("CompositeOracle", priceOracle.address, liquidityOracle.address);

    return oracle;
}

async function createUniswapV3Oracle(factory, quoteToken, period) {
    const oracle = createContract("UniswapV3Oracle", factory, quoteToken, period);

    return oracle;
}

async function createSlidingWindowOracle(underlyingOracle, quoteToken) {
    const period = 16;
    const numPeriods = 2;

    const oracle = createContract("SlidingWindowOracle", underlyingOracle, quoteToken, period, numPeriods);

    return oracle;
}

async function main() {
    const token = wethAddress;
    const baseToken = usdcAddress;

    const oraclePeriod = 8;

    var uniswapV2Oracle = await createUniswapV2Oracle(uniswapV2FactoryAddress, baseToken, oraclePeriod);
    var uniswapV3Oracle = await createUniswapV3Oracle(uniswapV3FactoryAddress, baseToken, oraclePeriod);
    var sushiswapOracle = await createUniswapV2Oracle(sushiswapFactoryAddress, baseToken, oraclePeriod);

    uniswapV2Oracle = await createSlidingWindowOracle(uniswapV2Oracle.address, baseToken);
    uniswapV3Oracle = await createSlidingWindowOracle(uniswapV3Oracle.address, baseToken);
    sushiswapOracle = await createSlidingWindowOracle(sushiswapOracle.address, baseToken);

    const aggregatedOracle = await createContract("AggregatedOracle", [
        uniswapV2Oracle.address,
        uniswapV3Oracle.address,
        sushiswapOracle.address,
    ], oraclePeriod);

    while (true) {
        try {
            const estimation = await aggregatedOracle.estimateGas.update(token);

            console.log("Aggregate update gas =", estimation.toString());

            await aggregatedOracle.update(token);
        } catch (e) {
            console.log(e);
        }

        try {
            const result = await uniswapV2Oracle['consult(address)'](token);

            console.log(
                "UniswapV2 Price =",
                result["price"].toString(),
                ", Token Liquidity =",
                result["tokenLiquidity"].toString(),
                ", Base Liquidity =",
                result["baseLiquidity"].toString()
            );
        } catch (e) {
            console.log(e);
        }

        try {
            const result = await uniswapV3Oracle['consult(address)'](token);

            console.log(
                "UniswapV3 Price =",
                result["price"].toString(),
                ", Token Liquidity =",
                result["tokenLiquidity"].toString(),
                ", Base Liquidity =",
                result["baseLiquidity"].toString()
            );
        } catch (e) {
            console.log(e);
        }

        try {
            const result = await sushiswapOracle['consult(address)'](token);

            console.log(
                "Sushiswap Price =",
                result["price"].toString(),
                ", Token Liquidity =",
                result["tokenLiquidity"].toString(),
                ", Base Liquidity =",
                result["baseLiquidity"].toString()
            );
        } catch (e) {
            console.log(e);
        }

        try {
            const estimation = await aggregatedOracle.estimateGas['consult(address)'](token);

            console.log("Aggregate consult gas =", estimation.toString());

            const result = await aggregatedOracle['consult(address)'](token);

            console.log(
                "Aggregate Price =",
                result["price"].toString(),
                ", Token Liquidity =",
                result["tokenLiquidity"].toString(),
                ", Base Liquidity =",
                result["baseLiquidity"].toString()
            );
        } catch (e) {
            console.log(e);
        }

        await sleep(1000);
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
