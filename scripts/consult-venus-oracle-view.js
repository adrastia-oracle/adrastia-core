const hre = require("hardhat");

const ethers = hre.ethers;

const ETHEREUM_ORACLE = "0xd2ce3fb018805ef92b8C5976cb31F84b4E295F94";

const ETHEREUM_WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createVenusOracleView(
    oracleAddress,
    quoteTokenName,
    quoteTokenAddress,
    quoteTokenSymbol,
    quoteTokenDecimals
) {
    const oracle = await createContract(
        "VenusOracleView",
        oracleAddress,
        quoteTokenName,
        quoteTokenAddress,
        quoteTokenSymbol,
        quoteTokenDecimals
    );

    return {
        oracle: oracle,
    };
}

async function main() {
    const token = ETHEREUM_USDC;

    const quoteTokenDecimals = 18;

    const oracle = await createVenusOracleView(
        ETHEREUM_ORACLE,
        "USD",
        ethers.constants.AddressZero,
        "USD",
        quoteTokenDecimals
    );

    const tokenContract = await ethers.getContractAt("ERC20", token);
    const tokenSymbol = await tokenContract.symbol();

    while (true) {
        const price = await oracle.oracle["consultPrice(address)"](token);

        // Convert to a human-readable format
        const priceFormatted = ethers.utils.commify(ethers.utils.formatUnits(price, quoteTokenDecimals));

        console.log("\u001b[" + 32 + "m" + "Price(%s) = %s" + "\u001b[0m", tokenSymbol, priceFormatted);

        await sleep(1000);

        const consultGas = await oracle.oracle.estimateGas["consultPrice(address)"](token);
        console.log("\u001b[" + 33 + "m" + "Gas used for consultPrice: %s" + "\u001b[0m", consultGas.toString());

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
