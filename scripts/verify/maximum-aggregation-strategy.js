const hre = require("hardhat");

const contractAddress = "0x92Eb6895550Fd2EFc1519De69f8b85A819A1fDC1";

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/strategies/aggregation/MaximumAggregator.sol:MaximumAggregator",
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
