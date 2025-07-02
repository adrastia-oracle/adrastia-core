// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const ethers = hre.ethers;

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const wethFeedAddress = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

const AGGREGATION_TIMESTAMP_STRATEGY_LATESTOBSERVATION = 2;

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

async function createOtfAggregatorOracle(
    quoteTokenName,
    quoteTokenAddress,
    quoteTokenSymbol,
    quoteTokenDecimals,
    liquidityDecimals,
    oracles,
    tokenSpecificOracles
) {
    const aggregationStrategy = await createContract(
        "MinimumAggregator",
        AGGREGATION_TIMESTAMP_STRATEGY_LATESTOBSERVATION
    );

    return await createContract(
        "OtfAggregatorOracle",
        {
            aggregationStrategy: aggregationStrategy.address,
            validationStrategy: ethers.constants.AddressZero, // No validation strategy
            quoteTokenName,
            quoteTokenAddress,
            quoteTokenSymbol,
            quoteTokenDecimals,
            liquidityDecimals,
            oracles,
            tokenSpecificOracles,
        },
        86400, // min freshness - 24 hours
        1 // minimum responses
    );
}

async function main() {
    const token = wethAddress;
    const quoteToken = ethers.constants.AddressZero;
    const feed = wethFeedAddress;
    const liquidityDecimals = 0; // Liquidity not supported

    const chainlinkOracle = await createChainlinkOracleView(feed, token, quoteToken);

    console.log("Chainlink Oracle Address =", chainlinkOracle.oracle.address);

    const oracles = [chainlinkOracle.oracle.address];

    const tokenSpecificOracles = [];

    const oracle = await createOtfAggregatorOracle(
        "USD Coin",
        quoteToken,
        "USDC",
        6,
        liquidityDecimals,
        oracles,
        tokenSpecificOracles
    );

    console.log("OtfAggregatorOracle Address =", oracle.address);

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
            const consultGas = await oracle.estimateGas["consult(address)"](token);

            if (!consultGas.eq(lastConsultGas)) {
                console.log("\u001b[" + 93 + "m" + "Consult gas used = " + consultGas + "\u001b[0m");

                lastConsultGas = consultGas;
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
