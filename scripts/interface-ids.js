const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {
    const factory = await ethers.getContractFactory("InterfaceIds");
    const interfaceIds = await factory.deploy();

    console.log("IPeriodic interfaceId =", await interfaceIds.iPeriodic());
    console.log("IPriceAccumulator interfaceId =", await interfaceIds.iPriceAccumulator());
    console.log("ILiquidityAccumulator interfaceId =", await interfaceIds.iLiquidityAccumulator());
    console.log("IHasPriceAccumulator interfaceId =", await interfaceIds.iHasPriceAccumulator());
    console.log("IHasLiquidityAccumulator interfaceId =", await interfaceIds.iHasLiquidityAccumulator());
    console.log("IPriceOracle interfaceId =", await interfaceIds.iPriceOracle());
    console.log("ILiquidityOracle interfaceId =", await interfaceIds.iLiquidityOracle());
    console.log("IUpdateable interfaceId =", await interfaceIds.iUpdateable());
    console.log("IAccumulator interfaceId =", await interfaceIds.iAccumulator());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
