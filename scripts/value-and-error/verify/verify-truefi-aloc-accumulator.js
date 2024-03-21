const hre = require("hardhat");

const ethers = hre.ethers;

const POLYGON_AVERAGING_GEOMETRIC = "0xF6bfDE89e4848B299e36B91AcF6d327e04C19520";

const contractAddress = "0xA3D38810FB75Cdb6df631CB7228561F76F76fa8f";

const updateTheshold = ethers.utils.parseUnits("0.05", 8); // 5% (relative) change -> update
const updateDelay = 60; // 60 seconds
const heartbeat = 8 * 60 * 60; // 8 hours
const averagingStrategyAddress = POLYGON_AVERAGING_GEOMETRIC;
const liquidityDecimals = 8;
const targetUtilization = ethers.utils.parseUnits("0.9", liquidityDecimals); // 90%

async function main() {
    await hre.run("verify:verify", {
        contract:
            "contracts/accumulators/proto/truefi/AlocUtilizationAndErrorAccumulator.sol:AlocUtilizationAndErrorAccumulator",
        address: contractAddress,
        constructorArguments: [
            targetUtilization,
            averagingStrategyAddress,
            liquidityDecimals,
            updateTheshold,
            updateDelay,
            heartbeat,
        ],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
