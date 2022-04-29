const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {
    const factory = await ethers.getContractFactory("InterfaceIds");
    const interfaceIds = await factory.deploy();

    console.log("IAggregatedOracle interfaceId =", await interfaceIds.iAggregatedOracle());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
