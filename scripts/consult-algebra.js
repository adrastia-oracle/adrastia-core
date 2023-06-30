const hre = require("hardhat");

const ethers = hre.ethers;

const algebraDeployer = "0x2D98E2FA9da15aa6dC9581AB097Ced7af697CB92"; // Quickswap v3 on Polygon
const algebraInitCodeHash = "0x6ec6c9c8091d160c0aa74b2b14ba9c1717e95093bd3ac085cee99a49aab294a4";

const wethAddress = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const wbtcAddress = "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6";
const wmaticAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const aaveAddress = "0xd6df932a45c0f255f85145f286ea0b292b21c90b";
const linkAddress = "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39";

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

async function createAlgebraOracle(
    priceAveragingStrategy,
    liquidityAveragingStrategy,
    factory,
    initCodeHash,
    quoteToken,
    period,
    granularity,
    liquidityDecimals
) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        "AlgebraLiquidityAccumulator",
        liquidityAveragingStrategy,
        factory,
        initCodeHash,
        quoteToken,
        liquidityDecimals,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const priceAccumulator = await createContract(
        "AlgebraPriceAccumulator",
        priceAveragingStrategy,
        factory,
        initCodeHash,
        quoteToken,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const oracle = await createContract(
        "PeriodicAccumulationOracle",
        liquidityAccumulator.address,
        priceAccumulator.address,
        quoteToken,
        period,
        granularity
    );

    return {
        liquidityAccumulator: liquidityAccumulator,
        priceAccumulator: priceAccumulator,
        oracle: oracle,
    };
}

async function main() {
    const token = usdcAddress;
    const quoteToken = wethAddress;

    const underlyingPeriodSeconds = 5;
    const granularity = 1;

    const liquidityDecimals = 4;

    console.log("Creating price and liquidity averaging strategies");

    const priceAveragingStrategy = await createContract("GeometricAveraging");
    const liquidityAveragingStrategy = await createContract("HarmonicAveragingWS80");

    console.log("Creating Algebra oracle");

    const algebra = await createAlgebraOracle(
        priceAveragingStrategy.address,
        liquidityAveragingStrategy.address,
        algebraDeployer,
        algebraInitCodeHash,
        quoteToken,
        underlyingPeriodSeconds,
        granularity,
        liquidityDecimals
    );

    console.log("Created Algebra oracle: " + algebra.oracle.address);

    const tokenContract = await ethers.getContractAt("ERC20", token);
    const quoteTokenContract = await ethers.getContractAt("ERC20", quoteToken);

    const tokenSymbol = await tokenContract.symbol();
    const quoteTokenSymbol = await quoteTokenContract.symbol();

    const tokenDecimals = await tokenContract.decimals();
    const quoteTokenDecimals = await quoteTokenContract.decimals();

    const updateData = ethers.utils.hexZeroPad(token, 32);

    while (true) {
        try {
            if (await algebra.liquidityAccumulator.canUpdate(updateData)) {
                const [tokenLiquidity, quoteTokenLiquidity] = await algebra.liquidityAccumulator[
                    "consultLiquidity(address,uint256)"
                ](token, 0);
                const currentTime = await currentBlockTimestamp();

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [token, tokenLiquidity, quoteTokenLiquidity, currentTime]
                );

                const updateTx = await algebra.liquidityAccumulator.update(laUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Liquidity accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await algebra.priceAccumulator.canUpdate(updateData)) {
                const price = await algebra.priceAccumulator["consultPrice(address,uint256)"](token, 0);
                const currentTime = await currentBlockTimestamp();

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token, price, currentTime]
                );

                const updateTx = await algebra.priceAccumulator.update(paUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Price accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await algebra.oracle.canUpdate(updateData)) {
                const updateTx = await algebra.oracle.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            const consultation = await algebra.oracle["consult(address)"](token);

            const priceStr = ethers.utils.commify(ethers.utils.formatUnits(consultation["price"], quoteTokenDecimals));

            console.log(
                "\u001b[" + 32 + "m" + "Price(%s) = %s %s" + "\u001b[0m",
                tokenSymbol,
                priceStr,
                quoteTokenSymbol
            );

            const tokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["tokenLiquidity"], liquidityDecimals)
            );

            const quoteTokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["quoteTokenLiquidity"], liquidityDecimals)
            );

            console.log(
                "\u001b[" + 31 + "m" + "Liquidity(%s) = %s, Liquidity(%s) = %s" + "\u001b[0m",
                tokenSymbol,
                tokenLiquidityStr,
                quoteTokenSymbol,
                quoteTokenLiquidityStr
            );
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
