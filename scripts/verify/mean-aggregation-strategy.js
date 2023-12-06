const hre = require("hardhat");

const contractAddress = "0x7094A70883DC4Ac71650D2A84378d28F04d6De0b";

const averagingStrategy = "0x8302AE5d7603E36f1078066C2e436C1ca0094610";

async function main() {
    await hre.run("verify:verify", {
        contract:
            "contracts/strategies/aggregation/QuoteTokenWeightedMeanAggregator.sol:QuoteTokenWeightedMeanAggregator",
        address: contractAddress,
        constructorArguments: [averagingStrategy],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
