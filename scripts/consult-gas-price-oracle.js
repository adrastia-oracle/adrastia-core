const hre = require("hardhat");

const ethers = hre.ethers;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const oracle = await ethers.getContractAt("IPriceOracle", "0xfb2a058e07e7adaddce98a1d836899b44a6ebd56");

    console.log(oracle);

    while (true) {
        await sleep(3000);

        const price = await oracle["consultPrice(address)"]("0x0000000000000000000000000000000000000001");

        console.log("Price: " + price.toString());

        // Keep mining blocks so that block.timestamp updates
        await hre.network.provider.send("evm_mine");
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
