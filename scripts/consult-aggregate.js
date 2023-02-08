// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const ethers = hre.ethers;

const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const uniswapV2InitCodeHash = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";

const uniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const uniswapV3InitCodeHash = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

const sushiswapFactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";
const sushiswapInitCodeHash = "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const grtAddress = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";
const compAddress = "0xc00e94cb662c3520282e6f5717214004a7f26888";
const uniAddress = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";
const ustAddress = "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD";
const usdtAddress = "0xdac17f958d2ee523a2206206994597c13d831ec7";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createUniswapV2Oracle(factory, initCodeHash, quoteToken, liquidityDecimals, period, granularity) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 10; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        "UniswapV2HarmonicLiquidityAccumulator",
        factory,
        initCodeHash,
        quoteToken,
        liquidityDecimals,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const priceAccumulator = await createContract(
        "UniswapV2GeometricPriceAccumulator",
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
        period,
        granularity
    );

    return {
        liquidityAccumulator: liquidityAccumulator,
        priceAccumulator: priceAccumulator,
        oracle: oracle,
    };
}

async function createUniswapV3Oracle(factory, initCodeHash, quoteToken, liquidityDecimals, period, granularity) {
    const poolFees = [/*500, */ 3000 /*, 10000*/];

    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 10; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        "UniswapV3HarmonicLiquidityAccumulator",
        factory,
        initCodeHash,
        poolFees,
        quoteToken,
        liquidityDecimals,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    const priceAccumulator = await createContract(
        "UniswapV3GeometricPriceAccumulator",
        factory,
        initCodeHash,
        poolFees,
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
        period,
        granularity
    );

    return {
        liquidityAccumulator: liquidityAccumulator,
        priceAccumulator: priceAccumulator,
        oracle: oracle,
    };
}

async function createAggregatedOracle(
    quoteTokenName,
    quoteTokenAddress,
    quoteTokenSymbol,
    quoteTokenDecimals,
    liquidityDecimals,
    period,
    granularity,
    oracles,
    tokenSpecificOracles
) {
    return await createContract(
        "AggregatedOracle",
        quoteTokenName,
        quoteTokenAddress,
        quoteTokenSymbol,
        quoteTokenDecimals,
        liquidityDecimals,
        oracles,
        tokenSpecificOracles,
        period,
        granularity,
        1,
        10 ** quoteTokenDecimals // minimum is one whole token
    );
}

async function main() {
    const token = wethAddress;
    const quoteToken = usdcAddress;

    const underlyingPeriodSeconds = 10;
    const periodSeconds = 10;
    const granularity = 2;

    const liquidityDecimals = 4;

    const increaseObservationsCapacityTo = 10;

    const uniswapV2 = await createUniswapV2Oracle(
        uniswapV2FactoryAddress,
        uniswapV2InitCodeHash,
        quoteToken,
        liquidityDecimals,
        underlyingPeriodSeconds,
        granularity
    );
    const sushiswap = await createUniswapV2Oracle(
        sushiswapFactoryAddress,
        sushiswapInitCodeHash,
        quoteToken,
        liquidityDecimals,
        underlyingPeriodSeconds,
        granularity
    );
    const uniswapV3 = await createUniswapV3Oracle(
        uniswapV3FactoryAddress,
        uniswapV3InitCodeHash,
        quoteToken,
        liquidityDecimals,
        underlyingPeriodSeconds,
        granularity
    );

    const oracles = [uniswapV2.oracle.address, sushiswap.oracle.address, uniswapV3.oracle.address];

    const tokenSpecificOracles = [];

    const oracle = await createAggregatedOracle(
        "USD Coin",
        quoteToken,
        "USDC",
        6,
        liquidityDecimals,
        periodSeconds,
        granularity,
        oracles,
        tokenSpecificOracles
    );

    const tokenContract = await ethers.getContractAt("ERC20", token);

    const tokenSymbol = await tokenContract.symbol();
    const tokenDecimals = await tokenContract.decimals();

    const quoteTokenSymbol = await oracle.quoteTokenSymbol();
    const quoteTokenDecimals = await oracle.quoteTokenDecimals();

    var lastConsultGas = 0;

    const updateData = ethers.utils.hexZeroPad(token, 32);

    console.log("Update data =", updateData);

    while (true) {
        try {
            if (await uniswapV2.liquidityAccumulator.canUpdate(updateData)) {
                const [tokenLiquidity, quoteTokenLiquidity] = await uniswapV2.liquidityAccumulator[
                    "consultLiquidity(address,uint256)"
                ](token, 0);

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
                        "Uniswap V2 liquidity accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await uniswapV2.priceAccumulator.canUpdate(updateData)) {
                const price = await uniswapV2.priceAccumulator["consultPrice(address,uint256)"](token, 0);

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(["address", "uint"], [token, price]);

                const updateTx = await uniswapV2.priceAccumulator.update(paUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Uniswap V2 price accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await uniswapV3.liquidityAccumulator.canUpdate(updateData)) {
                const [tokenLiquidity, quoteTokenLiquidity] = await uniswapV3.liquidityAccumulator[
                    "consultLiquidity(address,uint256)"
                ](token, 0);

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token, tokenLiquidity, quoteTokenLiquidity]
                );

                const updateTx = await uniswapV3.liquidityAccumulator.update(laUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Uniswap V3 liquidity accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await uniswapV3.priceAccumulator.canUpdate(updateData)) {
                const price = await uniswapV3.priceAccumulator["consultPrice(address,uint256)"](token, 0);

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(["address", "uint"], [token, price]);

                const updateTx = await uniswapV3.priceAccumulator.update(paUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Uniswap V3 price accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await sushiswap.liquidityAccumulator.canUpdate(updateData)) {
                const [tokenLiquidity, quoteTokenLiquidity] = await sushiswap.liquidityAccumulator[
                    "consultLiquidity(address,uint256)"
                ](token, 0);

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [token, tokenLiquidity, quoteTokenLiquidity]
                );

                const updateTx = await sushiswap.liquidityAccumulator.update(laUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Sushiswap liquidity accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await sushiswap.priceAccumulator.canUpdate(updateData)) {
                const price = await sushiswap.priceAccumulator["consultPrice(address,uint256)"](token, 0);

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(["address", "uint"], [token, price]);

                const updateTx = await sushiswap.priceAccumulator.update(paUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Sushiswap price accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (await oracle.canUpdate(updateData)) {
                const updateTx = await oracle.update(updateData);
                const updateReceipt = await updateTx.wait();

                // Print event logs
                for (const event of updateReceipt.events) {
                    console.log("\u001b[" + 93 + "m" + event["event"] + " " + event["args"] + "\u001b[0m");
                }

                console.log(
                    "\u001b[" + 93 + "m" + "Oracle updated. Gas used = " + updateReceipt["gasUsed"] + "\u001b[0m"
                );
            }

            const observationCount = await oracle["getObservationsCount(address)"](token);
            const observationCapacity = await oracle["getObservationsCapacity(address)"](token);

            console.log("Observations count = %s, capacity = %s", observationCount, observationCapacity);

            if (observationCapacity < increaseObservationsCapacityTo) {
                const capacityTx = await oracle["setObservationsCapacity(address,uint256)"](
                    token,
                    increaseObservationsCapacityTo
                );
                const capacityReceipt = await capacityTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Oracle capacity updated. Gas used = " +
                        capacityReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }

            if (observationCount > 0) {
                const consultGas = await oracle.estimateGas["consult(address)"](token);

                if (!consultGas.eq(lastConsultGas)) {
                    console.log("\u001b[" + 93 + "m" + "Consult gas used = " + consultGas + "\u001b[0m");

                    lastConsultGas = consultGas;
                }

                const consultation = await oracle["consult(address)"](token);

                const priceStr = ethers.utils.commify(
                    ethers.utils.formatUnits(consultation["price"], quoteTokenDecimals)
                );

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

                const observationAt0 = await oracle["getObservationAt(address,uint256)"](token, 0);
                console.log("Observation at 0 = %s", observationAt0.toString());

                if (observationCount > granularity) {
                    const observationAt2 = await oracle["getObservationAt(address,uint256)"](token, granularity);
                    console.log("Observation at %s = %s", granularity.toString(), observationAt2.toString());
                }

                const numObservationsToGet = ethers.BigNumber.from(observationCount).div(granularity);
                const offset = 0;

                const observationsGas = await oracle.estimateGas["getObservations(address,uint256)"](
                    token,
                    observationCount
                );
                const observations = await oracle["getObservations(address,uint256,uint256,uint256)"](
                    token,
                    numObservationsToGet,
                    offset,
                    granularity
                );

                console.log("Observations gas used = %s", observationsGas.toNumber());
                // Print the observations, expanding each observation into its own line
                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Observations(%s, %s, %s, %s) = " +
                        observations.map((o) => o.toString()).join(", ") +
                        "\u001b[0m",
                    tokenSymbol,
                    numObservationsToGet.toString(),
                    offset.toString(),
                    granularity.toString()
                );
            }
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
