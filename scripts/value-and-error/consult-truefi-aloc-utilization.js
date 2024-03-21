const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

const alocAddress = "0x84AC855F7f423e92E6d0316eC447253732Ba4082";

const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

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

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function createOracle(averagingStrategy, quoteToken, period, granularity, liquidityDecimals, target) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const priceAccumulator = await createContract("StaticPriceAccumulator", quoteToken, 2);

    const liquidityAccumulator = await createContract(
        "AlocUtilizationAndErrorAccumulator",
        target,
        averagingStrategy,
        liquidityDecimals,
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
    // Periodic oracle parameters
    const period = 10; // 10 seconds
    const granularity = 1;

    // Accumulator parameters
    const averagingStrategy = await createContract("ArithmeticAveraging");
    const quoteToken = ethers.constants.AddressZero;
    const token = alocAddress;
    const liquidityDecimals = 8;
    const targetUtilization = ethers.utils.parseUnits("0.9", liquidityDecimals);

    const oracle = await createOracle(
        averagingStrategy.address,
        quoteToken,
        period,
        granularity,
        liquidityDecimals,
        targetUtilization
    );

    const tokenContract = await ethers.getContractAt("ERC20", token);

    const tokenSymbol = await tokenContract.symbol();

    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

    while (true) {
        try {
            if (await oracle.priceAccumulator.canUpdate(updateData)) {
                const price = await oracle.priceAccumulator["consultPrice(address,uint256)"](token, 0);
                const currentTime = await currentBlockTimestamp();

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token, price, currentTime]
                );

                const updateTx = await oracle.priceAccumulator.update(paUpdateData);
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

            if (await oracle.liquidityAccumulator.canUpdate(updateData)) {
                const liquidity = await oracle.liquidityAccumulator["consultLiquidity(address,uint256)"](token, 0);
                const currentTime = await currentBlockTimestamp();

                console.log(liquidity);

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [token, liquidity.tokenLiquidity, liquidity.quoteTokenLiquidity, currentTime]
                );

                const updateTx = await oracle.liquidityAccumulator.update(laUpdateData);
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

            if (await oracle.oracle.canUpdate(updateData)) {
                const updateTx = await oracle.oracle.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            const consultation = await oracle.oracle["consult(address)"](token);

            const tokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["tokenLiquidity"], liquidityDecimals - 2)
            );

            const quoteTokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["quoteTokenLiquidity"].sub(ERROR_ZERO), liquidityDecimals - 2)
            );

            console.log(
                "\u001b[" + 31 + "m" + "Utilization(%s) = %s%, Error(%s) = %s%" + "\u001b[0m",
                tokenSymbol,
                tokenLiquidityStr,
                tokenSymbol,
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
