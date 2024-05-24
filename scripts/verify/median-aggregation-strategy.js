const hre = require("hardhat");

const contractAddress = "0x2a0755Ca1EbcB9c37C883c09DE5202b3cc7b7470";

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/strategies/aggregation/MedianAggregator.sol:MedianAggregator",
        address: contractAddress,
        constructorArguments: [],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
