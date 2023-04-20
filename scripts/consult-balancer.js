const hre = require("hardhat");

const ethers = hre.ethers;

const vaultAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

const bal80Weth20 = "0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014"; // Weighted Pool
const Wbtc20Ftm20Matic20Weth20Crv20 = "0x769432a08426d25f8f99a1af16db23ce41cad784000100000000000000000304"; // Weighted Pool

const rETH50weth50 = "0x1e19cf2d73a72ef1332c882f20534b6519be0276000200000000000000000112"; // Meta Stable Pool
const wstETHwETH = "0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080"; // Meta Stable Pool

const daiUsdcUsdt = "0x79c58f70905f734641735bc61e45c19dd9ad60bc0000000000000000000004e7"; // Composable Stable Pool
const wstETHrETHsfrxETH = "0x5aee1e99fe86960377de9f88689616916d5dcabe000000000000000000000467"; // Composable Stable Pool
const usddFraxUsdc = "0xf93579002dbe8046c43fefe86ec78b1112247bb80000000000000000000002bc"; // Stable Pool
const busdDaiUsdcUsdt = "0x81b7f92c7b7d9349b989b4982588761bfa1aa6270000000000000000000003e9"; // Composable Stable Pool

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const rethAddress = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const wstethAddress = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
const balAddress = "0xba100000625a3754423978a60c9317c58a424e3D";
const wbtcAddress = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
const usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const usddAddress = "0x0C10bF8FcB7Bf5412187A595ab97a3609160b5c6";

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

async function createBalancerOracle(
    priceAveragingStrategy,
    liquidityAveragingStrategy,
    vaultAddress,
    poolId,
    quoteTokenAddress,
    period,
    granularity,
    liquidityDecimals
) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        "BalancerV2LiquidityAccumulator",
        liquidityAveragingStrategy,
        vaultAddress,
        poolId,
        quoteTokenAddress,
        liquidityDecimals,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const priceAccumulator = await createContract(
        "BalancerV2StablePriceAccumulator",
        priceAveragingStrategy,
        vaultAddress,
        poolId,
        quoteTokenAddress,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const oracle = await createContract(
        "PeriodicAccumulationOracle",
        liquidityAccumulator.address,
        priceAccumulator.address,
        quoteTokenAddress,
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
    const poolId = wstETHwETH;

    const token = wstethAddress;
    const quoteToken = wethAddress;

    const period = 10; // 10 seconds
    const granularity = 1;

    const liquidityDecimals = 4;

    const priceAveragingStrategy = await createContract("GeometricAveraging");
    const liquidityAveragingStrategy = await createContract("HarmonicAveragingWS80");

    const curve = await createBalancerOracle(
        priceAveragingStrategy.address,
        liquidityAveragingStrategy.address,
        vaultAddress,
        poolId,
        quoteToken,
        period,
        granularity,
        liquidityDecimals
    );

    const tokenContract = await ethers.getContractAt("ERC20", token);
    const quoteTokenContract = await ethers.getContractAt("ERC20", quoteToken);

    const tokenSymbol = await tokenContract.symbol();
    const quoteTokenSymbol = await quoteTokenContract.symbol();

    const tokenDecimals = await tokenContract.decimals();
    const quoteTokenDecimals = await quoteTokenContract.decimals();

    const updateData = ethers.utils.hexZeroPad(token, 32);

    while (true) {
        try {
            if (await curve.liquidityAccumulator.canUpdate(updateData)) {
                const [tokenLiquidity, quoteTokenLiquidity] = await curve.liquidityAccumulator[
                    "consultLiquidity(address,uint256)"
                ](token, 0);
                const currentTime = await currentBlockTimestamp();

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [token, tokenLiquidity, quoteTokenLiquidity, currentTime]
                );

                const updateTx = await curve.liquidityAccumulator.update(laUpdateData);
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

            if (await curve.priceAccumulator.canUpdate(updateData)) {
                const price = await curve.priceAccumulator["consultPrice(address,uint256)"](token, 0);
                const currentTime = await currentBlockTimestamp();

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token, price, currentTime]
                );

                const updateTx = await curve.priceAccumulator.update(paUpdateData);
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

            if (await curve.oracle.canUpdate(updateData)) {
                const updateTx = await curve.oracle.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            const consultation = await curve.oracle["consult(address)"](token);

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
