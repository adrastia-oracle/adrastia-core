const hre = require("hardhat");

const contractAddress = "0xE37A9FD35D5FE872f1dCE4181e13A523546bca8E";

const GEOMETRIC = "contracts/strategies/averaging/GeometricAveraging.sol:GeometricAveraging";
const HARMONIC_WS80 = "contracts/strategies/averaging/HarmonicAveragingWS80.sol:HarmonicAveragingWS80";

async function main() {
    await hre.run("verify:verify", {
        contract: HARMONIC_WS80,
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
