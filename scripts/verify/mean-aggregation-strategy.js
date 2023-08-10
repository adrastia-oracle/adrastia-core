const hre = require("hardhat");

const contractAddress = "0xc2861530884607C5d2D327106CA00f252f934962";

const averagingStrategy = "0xd850F64Eda6a62d625209711510f43cD49Ef8798";

async function main() {
    await hre.run("verify:verify", {
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
