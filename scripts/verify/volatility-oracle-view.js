const hre = require("hardhat");

const contractAddress = "0x95A851F7C0a73b3121B3a1724732c8114B490512";

const precisionDecimals = 8;

async function main() {
    await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [precisionDecimals],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
