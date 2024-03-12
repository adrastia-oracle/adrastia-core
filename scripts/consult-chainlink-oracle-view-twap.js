const hre = require("hardhat");

const ethers = hre.ethers;

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const wethFeedAddress = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

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

async function createChainlinkOracleView(feedAddress, tokenAddress, quoteTokenAddress) {
    const oracle = await createContract("ChainlinkOracleView", feedAddress, tokenAddress, quoteTokenAddress);

    return {
        oracle: oracle,
    };
}

async function createTwapOracle(priceAveragingStrategy, adrastiaOracle, quoteToken, period, granularity) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 8 * 60 * 60; // 8 hour heartbeat

    const priceAccumulator = await createContract(
        "AdrastiaPriceAccumulator",
        true,
        priceAveragingStrategy,
        adrastiaOracle,
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
        0,
        0
    );

    return {
        priceAccumulator: priceAccumulator,
        oracle: oracle,
    };
}

async function main() {
    const token = wethAddress;
    const feed = wethFeedAddress;

    const period = 10;
    const granularity = 1;

    const quoteTokenContract = await createContract("NotAnErc20", "USD", "USD", 8);

    const quoteToken = quoteTokenContract.address;

    const oracleView = await createChainlinkOracleView(feed, token, quoteToken);

    const priceAveragingStrategy = await createContract("GeometricAveraging");

    const oracle = await createTwapOracle(
        priceAveragingStrategy.address,
        oracleView.oracle.address,
        quoteToken,
        period,
        granularity
    );

    const quoteTokenDecimals = await oracle.oracle.quoteTokenDecimals();
    const quoteTokenSymbol = await quoteTokenContract.symbol();

    const tokenContract = await ethers.getContractAt("ERC20", token);
    const tokenSymbol = await tokenContract.symbol();

    const updateData = ethers.utils.hexZeroPad(token, 32);

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

            if (await oracle.oracle.canUpdate(updateData)) {
                const updateTx = await oracle.oracle.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            try {
                const consultation = await oracle.oracle["consult(address)"](token);

                const priceStr = ethers.utils.commify(
                    ethers.utils.formatUnits(consultation["price"], quoteTokenDecimals)
                );

                console.log(
                    "\u001b[" + 32 + "m" + "Price(%s) = %s %s" + "\u001b[0m",
                    tokenSymbol,
                    priceStr,
                    quoteTokenSymbol
                );
            } catch (e) {}
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
