const hre = require("hardhat");

const ethers = hre.ethers;

const contractAddress = "0x66244d50b8802b189F9Df035d5fF0608a08043b6";

const quoteTokenDecimals = 18;
const minimumTokenLiquidityValue = ethers.utils.parseUnits("1000", 4);
const minimumQuoteTokenLiquidity = ethers.utils.parseUnits("1000", 4);
const minimumLiquidityRatio = 100; // 1:100 value(token):value(quoteToken)
const maximumLiquidityRatio = 1000000; // 100:1 value(token):value(quoteToken)

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/strategies/validation/DefaultValidation.sol:DefaultValidation",
        address: contractAddress,
        constructorArguments: [
            quoteTokenDecimals,
            minimumTokenLiquidityValue,
            minimumQuoteTokenLiquidity,
            minimumLiquidityRatio,
            maximumLiquidityRatio,
        ],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
