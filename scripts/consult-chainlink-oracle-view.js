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

async function createChainlinkOracleView(feedAddress, tokenAddress, quoteTokenAddress) {
    const oracle = await createContract("ChainlinkOracleView", feedAddress, tokenAddress, quoteTokenAddress);

    return {
        oracle: oracle,
    };
}

async function main() {
    const token = wethAddress;
    const quoteToken = ethers.constants.AddressZero;
    const feed = wethFeedAddress;

    const oracle = await createChainlinkOracleView(feed, token, quoteToken);

    const quoteTokenDecimals = await oracle.oracle.quoteTokenDecimals();

    const tokenContract = await ethers.getContractAt("ERC20", token);
    const tokenSymbol = await tokenContract.symbol();

    while (true) {
        const price = await oracle.oracle["consultPrice(address)"](token);

        // Convert to a human-readable format
        const priceFormatted = ethers.utils.commify(ethers.utils.formatUnits(price, quoteTokenDecimals));

        console.log("\u001b[" + 32 + "m" + "Price(%s) = %s" + "\u001b[0m", tokenSymbol, priceFormatted);

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
