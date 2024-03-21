const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

const compoundV2Comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";

const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const wbtcAddress = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";

const mode_ionicComptroller = "0xfb3323e24743caf4add0fdccfb268565c0685556";
const mode_usdcAddress = "0xd988097fb8612cc24eeC14542bC03424c656005f";
const mode_wethAddress = "0x4200000000000000000000000000000000000006";

const DEFAULT_CONTRACT = "CompoundV2SBAccumulator";
const IONIC_CONTRACT = "IonicSBAccumulator";

const CONTRACT = IONIC_CONTRACT;

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

async function createOracle(averagingStrategy, comptroller, quoteToken, period, granularity, liquidityDecimals) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const priceAccumulator = await createContract("StaticPriceAccumulator", quoteToken, 2);

    const liquidityAccumulator = await createContract(
        CONTRACT,
        averagingStrategy,
        comptroller,
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
    const averagingStrategy = await createContract("GeometricAveraging");
    const comptroller = mode_ionicComptroller;
    const quoteToken = ethers.constants.AddressZero;
    const token = mode_wethAddress;
    const liquidityDecimals = 4;

    const oracle = await createOracle(
        averagingStrategy.address,
        comptroller,
        quoteToken,
        period,
        granularity,
        liquidityDecimals
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
                ethers.utils.formatUnits(consultation["tokenLiquidity"], liquidityDecimals)
            );

            const quoteTokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["quoteTokenLiquidity"], liquidityDecimals)
            );

            console.log(
                "\u001b[" + 31 + "m" + "Borrow(%s) = %s, Supply(%s) = %s" + "\u001b[0m",
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
