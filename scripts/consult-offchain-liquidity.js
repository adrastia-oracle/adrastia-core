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
    const liquidityDecimals = 0;
    const updateTheshold = 25000000; // 25% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 10; // At most (optimistically) 10 seconds between every update

    const priceAveragingStrategy = await createContract("GeometricAveraging");

    const accumulator = await createContract(
        "OffchainLiquidityAccumulator",
        priceAveragingStrategy.address,
        quoteToken,
        liquidityDecimals,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    while (true) {
        try {
            // Generate random numbers from 100 and 150
            const tokenLiquidity = Math.floor(Math.random() * 50) + 100;
            const quoteTokenLiquidity = Math.floor(Math.random() * 50) + 100;

            const currentTime = await currentBlockTimestamp();
            const updateData = ethers.utils.defaultAbiCoder.encode(
                ["address", "uint", "uint", "uint"],
                [token, tokenLiquidity, quoteTokenLiquidity, currentTime]
            );

            if (await accumulator.canUpdate(updateData)) {
                const updateTx = await accumulator.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        32 +
                        "m" +
                        "Offchain liquidity accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            const consultLiquidity = await accumulator["consultLiquidity(address)"](token);

            const tokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultLiquidity["tokenLiquidity"], liquidityDecimals)
            );

            const quoteTokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultLiquidity["quoteTokenLiquidity"], liquidityDecimals)
            );

            console.log(
                "\u001b[" + 31 + "m" + "Token liquidity = %s, Quote token liquidity = %s" + "\u001b[0m",
                tokenLiquidityStr,
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
