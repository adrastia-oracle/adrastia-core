const hre = require("hardhat");

const ethers = hre.ethers;

const contractAddress = "0xF403D00217B1c97CDe7CC08b35F0d3C8F939BF14";

const quoteTokenDecimals = 18;
const minimumTokenLiquidityValue = ethers.utils.parseUnits("0", 4);
const minimumQuoteTokenLiquidity = ethers.utils.parseUnits("0", 4);
const minimumLiquidityRatio = 100; // 1:100 value(token):value(quoteToken)
const maximumLiquidityRatio = 1000000; // 100:1 value(token):value(quoteToken)

async function main() {
    await hre.run("verify:verify", {
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
