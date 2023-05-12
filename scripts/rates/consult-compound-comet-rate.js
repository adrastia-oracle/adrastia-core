const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

const cometAddress = "0xc3d688B66703497DAA19211EEdff47f25384cdc3"; // cUSDCv3 on mainnet

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

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

async function createOracle(averagingStrategy, comet, quoteToken, period, granularity) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract("StaticLiquidityAccumulator", quoteToken, 0, 0, 0);

    const priceAccumulator = await createContract(
        "CometRateAccumulator",
        averagingStrategy,
        comet,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const oracle = await createContract(
        "PeriodicPriceAccumulationOracle",
        priceAccumulator.address,
        quoteToken,
        period,
        granularity,
        0,
        2,
        2
    );

    return {
        liquidityAccumulator: liquidityAccumulator,
        priceAccumulator: priceAccumulator,
        oracle: oracle,
    };
}

function decimalToEthereumAddress(decimalNumber) {
    // Convert the decimal number to a hexadecimal string
    const hexString = decimalNumber.toString(16);

    // Pad the hexadecimal string with leading zeros to get 40 characters
    const paddedHexString = hexString.padStart(40, "0");

    // Add the '0x' prefix to get the Ethereum address
    const ethereumAddress = ethers.utils.getAddress("0x" + paddedHexString);

    return ethereumAddress;
}

async function main() {
    // Periodic oracle parameters
    const period = 10; // 10 seconds
    const granularity = 1;

    // Accumulator parameters
    const averagingStrategy = await createContract("GeometricAveraging");
    const comet = cometAddress;
    const quoteToken = wethAddress; // It would be better to call comet.baseToken()

    // Type of rate we want to consult
    const rateType = 16; // 16 = supply rate, 17 = borrow rate

    const oracle = await createOracle(averagingStrategy.address, comet, quoteToken, period, granularity);

    // Encode rateType as bytes
    const updateData = ethers.utils.defaultAbiCoder.encode(["uint256"], [rateType]);

    // Encode rateType as address
    const rateTypeAsToken = decimalToEthereumAddress(rateType);

    while (true) {
        try {
            if (await oracle.priceAccumulator.canUpdate(updateData)) {
                const price = await oracle.priceAccumulator["consultPrice(address,uint256)"](rateTypeAsToken, 0);
                const currentTime = await currentBlockTimestamp();

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [rateTypeAsToken, price, currentTime]
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

            if (await oracle.oracle.canUpdate(updateData)) {
                const updateTx = await oracle.oracle.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            const consultation = await oracle.oracle["consult(address)"](rateTypeAsToken);

            const rateStr = (+ethers.utils.formatUnits(consultation["price"], 18 - 2)).toFixed(2);

            console.log("\u001b[" + 32 + "m" + "APR(%s) = %s%" + "\u001b[0m", quoteToken, rateStr);
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
