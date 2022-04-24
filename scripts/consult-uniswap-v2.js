// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const ethers = hre.ethers;

const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const uniswapV2InitCodeHash = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";

const sushiswapFactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";
const sushiswapInitCodeHash = "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const grtAddress = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createUniswapV2Oracle(factory, initCodeHash, quoteToken, period) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        "UniswapV2LiquidityAccumulator",
        factory,
        initCodeHash,
        quoteToken,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const priceAccumulator = await createContract(
        "UniswapV2PriceAccumulator",
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
        period
    );

    return {
        liquidityAccumulator: liquidityAccumulator,
        priceAccumulator: priceAccumulator,
        oracle: oracle,
    };
}

async function main() {
    const factoryAddress = uniswapV2FactoryAddress;
    const initCodeHash = uniswapV2InitCodeHash;

    const token = wethAddress;
    const quoteToken = usdcAddress;

    const period = 10; // 10 seconds

    const uniswapV2 = await createUniswapV2Oracle(factoryAddress, initCodeHash, quoteToken, period);

    const tokenContract = await ethers.getContractAt("ERC20", token);
    const quoteTokenContract = await ethers.getContractAt("ERC20", quoteToken);

    const tokenSymbol = await tokenContract.symbol();
    const quoteTokenSymbol = await quoteTokenContract.symbol();

    const tokenDecimals = await tokenContract.decimals();
    const quoteTokenDecimals = await quoteTokenContract.decimals();

    const updateData = ethers.utils.hexZeroPad(token, 32);

    while (true) {
        try {
            if (await uniswapV2.liquidityAccumulator.canUpdate(updateData)) {
                const [tokenLiquidity, quoteTokenLiquidity] = await uniswapV2.liquidityAccumulator[
                    "consultLiquidity(address)"
                ](token);

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token, tokenLiquidity, quoteTokenLiquidity]
                );

                const updateTx = await uniswapV2.liquidityAccumulator.update(laUpdateData);
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

            if (await uniswapV2.priceAccumulator.canUpdate(updateData)) {
                const price = await uniswapV2.priceAccumulator["consultPrice(address)"](token);

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(["address", "uint"], [token, price]);

                const updateTx = await uniswapV2.priceAccumulator.update(paUpdateData);
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

            if (await uniswapV2.oracle.canUpdate(updateData)) {
                const updateTx = await uniswapV2.oracle.update(updateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            const consultation = await uniswapV2.oracle["consult(address)"](token);

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
