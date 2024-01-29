const hre = require("hardhat");

const ethers = hre.ethers;

const POLYGON_NIL_PA = "0x0100Dc5a4b099318Ed8a2efACFc1C0e3550dbbEd";

const contractAddress = "0x0E3612fcD04688f115D06F76848F9D7629F3f019";

const liquidityAccumulatorAddress = "0xA3D38810FB75Cdb6df631CB7228561F76F76fa8f";
const priceAccumulatorAddress = POLYGON_NIL_PA;
const quoteToken = ethers.constants.AddressZero;
const period = 24 * 60 * 60; // 24 hours
const granularity = 2;

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/oracles/PeriodicAccumulationOracle.sol:PeriodicAccumulationOracle",
        address: contractAddress,
        constructorArguments: [liquidityAccumulatorAddress, priceAccumulatorAddress, quoteToken, period, granularity],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
