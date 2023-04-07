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
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 10; // At most (optimistically) 10 seconds between every update

    const accumulator = await createContract(
        "OffchainPriceAccumulator",
        quoteToken,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    while (true) {
        try {
            // Generate a random number from 100 and 150
            const price = Math.floor(Math.random() * 50) + 100;
            const currentTime = await currentBlockTimestamp();
            const updateData = ethers.utils.defaultAbiCoder.encode(
                ["address", "uint", "uint"],
                [token, price, currentTime]
            );

            if (await accumulator.canUpdate(updateData)) {
                const updateTx = await accumulator.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        32 +
                        "m" +
                        "Offchain price accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            const consultPrice = await accumulator["consultPrice(address)"](token);

            console.log("\u001b[" + 93 + "m" + "Price = " + consultPrice + "\u001b[0m");
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
