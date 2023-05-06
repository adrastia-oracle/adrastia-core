const hre = require("hardhat");

const ethers = hre.ethers;

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

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

async function createStaticOracle(
    quoteToken,
    period,
    granularity,
    liquidityDecimals,
    price,
    tokenLiquidity,
    quoteTokenLiquidity
) {
    const liquidityAccumulator = await createContract(
        "StaticLiquidityAccumulator",
        quoteToken,
        liquidityDecimals,
        tokenLiquidity,
        quoteTokenLiquidity
    );

    const priceAccumulator = await createContract("StaticPriceAccumulator", quoteToken, price);

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
    const token = wethAddress;
    const quoteToken = usdcAddress;

    const quoteTokenContract = await ethers.getContractAt("ERC20", quoteToken);

    const period = 10; // 10 seconds
    const granularity = 1;

    const liquidityDecimals = 4;
    const priceDecimals = await quoteTokenContract.decimals();

    const price = ethers.utils.parseUnits("3", priceDecimals);
    const tokenLiquidity = ethers.utils.parseUnits("5", liquidityDecimals);
    const quoteTokenLiquidity = ethers.utils.parseUnits("7", liquidityDecimals);

    const oracle = await createStaticOracle(
        quoteToken,
        period,
        granularity,
        liquidityDecimals,
        price,
        tokenLiquidity,
        quoteTokenLiquidity
    );

    const tokenContract = await ethers.getContractAt("ERC20", token);

    const tokenSymbol = await tokenContract.symbol();
    const quoteTokenSymbol = await quoteTokenContract.symbol();

    const updateData = ethers.utils.hexZeroPad(token, 32);

    while (true) {
        try {
            if (await oracle.liquidityAccumulator.canUpdate(updateData)) {
                const [tokenLiquidity, quoteTokenLiquidity] = await oracle.liquidityAccumulator[
                    "consultLiquidity(address,uint256)"
                ](token, 0);
                const currentTime = await currentBlockTimestamp();

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [token, tokenLiquidity, quoteTokenLiquidity, currentTime]
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

                const priceStr = ethers.utils.commify(ethers.utils.formatUnits(consultation["price"], priceDecimals));

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
