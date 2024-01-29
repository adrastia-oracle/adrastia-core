const hre = require("hardhat");

const contractAddress = "0x90C8E14d36bfc6ea6c871F5874eE095631d4eDC6";

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/strategies/aggregation/MinimumAggregator.sol:MinimumAggregator",
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
