const hre = require("hardhat");
const { currentBlockTimestamp } = require("../src/time");

const ethers = hre.ethers;

const adapterEzEthVault = "0x945f0cf0DDb3A20a4737d3e1f3cA43DE9C185440";
const adapterRswEthVault = "0xe6cD0b7800cA3e297b8fBd7697Df9E9F6A27f0F5";

const ezEthAddress = "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110";
const rswEthAddress = "0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0";

const ezEthFeedAddress = "0x636A000262F6aA9e1F094ABF0aD8f645C44f641C"; // Chainlink ezETH/ETH
const rswEthFeedAddress = "0xb613CfebD0b6e95abDDe02677d6bC42394FdB857";

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const wethFeedAddress = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function createChainlinkOracleView(feedAddress, tokenAddress, quoteTokenAddress) {
    const oracle = await createContract("ChainlinkOracleView", feedAddress, tokenAddress, quoteTokenAddress);

    return oracle;
}

async function createSAVPriceAccumulator(underlyingOracle, averagingStrategy, quoteTokenAddress) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 24 * 60 * 60; // 24 hour heartbeat

    const priceAccumulator = await createContract(
        "SAVPriceAccumulator",
        underlyingOracle,
        averagingStrategy,
        quoteTokenAddress,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    return priceAccumulator;
}

async function main() {
    const vaultAddress = adapterRswEthVault;
    const underlyingAsset = rswEthAddress;
    const quoteToken = wethAddress;

    const underlyingOracle = await createChainlinkOracleView(rswEthFeedAddress, underlyingAsset, quoteToken);

    const underlyingOracleDecimals = await underlyingOracle.quoteTokenDecimals();

    const underlyingAssetContract = await ethers.getContractAt("ERC20", underlyingAsset);
    const underlyingAssetSymbol = await underlyingAssetContract.symbol();
    const underlyingAssetDecimals = await underlyingAssetContract.decimals();

    const averagingStrategy = await createContract("GeometricAveraging");

    const savPriceOracle = await createSAVPriceAccumulator(
        underlyingOracle.address,
        averagingStrategy.address,
        quoteToken
    );

    const savPriceOracleDecimals = await savPriceOracle.quoteTokenDecimals();
    const savPriceOracleSymbol = await savPriceOracle.quoteTokenSymbol();

    const vault = await ethers.getContractAt("ERC4626", vaultAddress);
    const vaultDecimals = await vault.decimals();
    const vaultSymbol = await vault.symbol();

    const checkUpdateData = ethers.utils.defaultAbiCoder.encode(["address"], [vaultAddress]);

    while (true) {
        const underlyingAssetPrice = await underlyingOracle["consultPrice(address)"](underlyingAsset);

        // Convert to a human-readable format
        const underlyingAssetPriceFormatted = ethers.utils.commify(
            ethers.utils.formatUnits(underlyingAssetPrice, underlyingOracleDecimals)
        );

        console.log(
            "\u001b[" + 32 + "m" + "Price(%s) = %s" + "\u001b[0m",
            underlyingAssetSymbol,
            underlyingAssetPriceFormatted
        );

        try {
            // Update the price accumulator
            if (await savPriceOracle.canUpdate(checkUpdateData)) {
                const price = await savPriceOracle["consultPrice(address,uint256)"](vaultAddress, 0);
                const currentTime = await currentBlockTimestamp();

                const paUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint"],
                    [vaultAddress, price, currentTime]
                );

                const updateTx = await savPriceOracle.update(paUpdateData);
                const updateReceipt = await updateTx.wait();

                console.log(
                    "\u001b[" +
                        93 +
                        "m" +
                        "Price accumulator updated. Gas used = " +
                        updateReceipt["gasUsed"] +
                        "\u001b[0m"
                );
            }
        } catch (e) {}

        try {
            const vaultSharePrice = await savPriceOracle["consultPrice(address)"](vaultAddress);

            // Convert to a human-readable format
            const vaultSharePriceFormatted = ethers.utils
                .commify(ethers.utils.formatUnits(vaultSharePrice, savPriceOracleDecimals))
                .concat(" ", savPriceOracleSymbol);

            console.log("\u001b[" + 32 + "m" + "Price(%s) = %s" + "\u001b[0m", vaultSymbol, vaultSharePriceFormatted);

            const vaultTotalSupply = await vault.totalSupply();
            const vaultDecimals = await vault.decimals();

            const vaultTvl = vaultTotalSupply.mul(vaultSharePrice);

            const tvlDecimals = savPriceOracleDecimals + vaultDecimals;

            // Convert to a human-readable format
            const vaultTvlFormatted = ethers.utils
                .commify(ethers.utils.formatUnits(vaultTvl, tvlDecimals))
                .concat(" ", savPriceOracleSymbol);

            console.log("\u001b[" + 32 + "m" + "TVL = %s" + "\u001b[0m", vaultTvlFormatted);
        } catch (e) {}

        await sleep(1000);

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
