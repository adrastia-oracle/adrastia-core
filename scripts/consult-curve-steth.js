// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const ethers = hre.ethers;

const curveStEthPoolAddress = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";

const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const stEthAddress = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createCurveOracle(pool, quoteToken, period) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        "CurveLiquidityAccumulator",
        pool,
        2,
        quoteToken,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const priceAccumulator = await createContract(
        "CurvePriceAccumulator",
        pool,
        2,
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
        period
    );

    return oracle;
}

async function main() {
    const poolAddress = curveStEthPoolAddress;

    const token = stEthAddress;
    const quoteToken = ethAddress;

    const period = 10; // 10 seconds

    const oracle = await createCurveOracle(poolAddress, quoteToken, period);

    const tokenContract = await ethers.getContractAt("ERC20", token);

    const tokenSymbol = await tokenContract.symbol();
    const quoteTokenSymbol = "ETH";

    const tokenDecimals = await tokenContract.decimals();
    const quoteTokenDecimals = 18;

    while (true) {
        try {
            if (await oracle.needsUpdate(token)) {
                const updateTx = await oracle.update(token);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            const consultation = await oracle["consult(address)"](token);

            const priceStr = ethers.utils.commify(ethers.utils.formatUnits(consultation["price"], quoteTokenDecimals));

            console.log(
                "\u001b[" + 32 + "m" + "Price(%s) = %s %s" + "\u001b[0m",
                tokenSymbol,
                priceStr,
                quoteTokenSymbol
            );

            const tokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["tokenLiquidity"], tokenDecimals)
            );

            const quoteTokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["quoteTokenLiquidity"], quoteTokenDecimals)
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
