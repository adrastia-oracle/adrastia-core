const hre = require("hardhat");

const ethers = hre.ethers;

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const pythAddress = "0x4305FB66699C3B2702D4d05CF36551390A4c69C6";
const wethFeedId = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createPythOracleView(pythAddress, feedId, tokenAddress, quoteTokenAddress) {
    const oracle = await createContract("PythOracleView", pythAddress, feedId, tokenAddress, quoteTokenAddress);

    return {
        oracle: oracle,
    };
}

async function main() {
    const token = wethAddress;
    const quoteToken = usdcAddress;
    const feedId = wethFeedId;

    const oracle = await createPythOracleView(pythAddress, feedId, token, quoteToken);

    const quoteTokenDecimals = await oracle.oracle.quoteTokenDecimals();

    const tokenContract = await ethers.getContractAt("ERC20", token);
    const tokenSymbol = await tokenContract.symbol();

    const tokenEncoded = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

    while (true) {
        const price = await oracle.oracle["consultPrice(address)"](token);

        // Convert to a human-readable format
        const priceFormatted = ethers.utils.commify(ethers.utils.formatUnits(price, quoteTokenDecimals));

        console.log("\u001b[" + 32 + "m" + "Price(%s) = %s" + "\u001b[0m", tokenSymbol, priceFormatted);

        const timeSinceLastUpdate = await oracle.oracle["timeSinceLastUpdate(bytes)"](tokenEncoded);

        // Print the time since the last update in minutes and seconds
        console.log(
            "Time since last update: %d minutes, %d seconds",
            timeSinceLastUpdate.div(60),
            timeSinceLastUpdate.mod(60)
        );

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
