const { BigNumber } = require("ethers");
const hre = require("hardhat");

const ethers = hre.ethers;

const compoundV2Comptroller = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";

const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const wbtcAddress = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";

const mode_ionicComptroller = "0xfb3323e24743caf4add0fdccfb268565c0685556";
const mode_usdcAddress = "0xd988097fb8612cc24eeC14542bC03424c656005f";
const mode_wethAddress = "0x4200000000000000000000000000000000000006";

const DEFAULT_CONTRACT = "CompoundV2SBAccumulator";
const IONIC_CONTRACT = "IonicSBAccumulator";

const CONTRACT = IONIC_CONTRACT;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
    const contractFactory = await ethers.getContractFactory(name);

    const contract = await contractFactory.deploy(...deploymentArgs);

    await contract.deployed();

    return contract;
}

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function createSBOracle(averagingStrategy, comptroller, liquidityDecimals) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const liquidityAccumulator = await createContract(
        CONTRACT,
        averagingStrategy,
        comptroller,
        liquidityDecimals,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    return liquidityAccumulator;
}

async function createUtilizationOracle(
    sbOracle,
    considerEmptyAs100Percent,
    targetUtilization,
    averagingStrategy,
    decimals
) {
    const updateTheshold = 2000000; // 2% change -> update
    const minUpdateDelay = 5; // At least 5 seconds between every update
    const maxUpdateDelay = 60; // At most (optimistically) 60 seconds between every update

    const utilizationAccumulator = await createContract(
        "AdrastiaUtilizationAndErrorAccumulator",
        sbOracle,
        considerEmptyAs100Percent,
        targetUtilization,
        averagingStrategy,
        decimals,
        updateTheshold,
        minUpdateDelay,
        maxUpdateDelay
    );

    return utilizationAccumulator;
}

async function main() {
    // Accumulator parameters
    const sbAveragingStrategy = await createContract("GeometricAveraging");
    const utilAveragingStrategy = await createContract("ArithmeticAveraging");
    const comptroller = mode_ionicComptroller;
    const token = mode_usdcAddress;
    const liquidityDecimals = 4;
    const utilizationDecimals = 18;
    const targetUtilization = ethers.utils.parseUnits("0.8", liquidityDecimals);

    const sbOracle = await createSBOracle(sbAveragingStrategy.address, comptroller, liquidityDecimals);

    await sbOracle.deployed();

    const utilizationOracle = await createUtilizationOracle(
        sbOracle.address,
        true,
        targetUtilization,
        utilAveragingStrategy.address,
        utilizationDecimals
    );

    const tokenContract = await ethers.getContractAt("ERC20", token);

    const tokenSymbol = await tokenContract.symbol();

    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

    while (true) {
        try {
            if (await sbOracle.canUpdate(updateData)) {
                const liquidity = await sbOracle["consultLiquidity(address,uint256)"](token, 0);
                const currentTime = await currentBlockTimestamp();

                const laUpdateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [token, liquidity.tokenLiquidity, liquidity.quoteTokenLiquidity, currentTime]
                );

                const updateTx = await sbOracle.update(laUpdateData);
                const updateReceipt = await updateTx.wait();

                // Read Updated event (if any)
                const updatedEvent = updateReceipt.events.find((event) => event.event === "Updated");
                if (updatedEvent) {
                    const updatedToken = updatedEvent.args[0];

                    const totalBorrow = updatedEvent.args[1];
                    const totalSupply = updatedEvent.args[2];

                    // Format data
                    const totalBorrowStr = ethers.utils.commify(
                        ethers.utils.formatUnits(totalBorrow, liquidityDecimals)
                    );
                    const totalSupplyStr = ethers.utils.commify(
                        ethers.utils.formatUnits(totalSupply, liquidityDecimals)
                    );

                    console.log(
                        "\u001b[" +
                            93 +
                            "m" +
                            "SB accumulator updated. Gas used = " +
                            updateReceipt["gasUsed"] +
                            "\u001b[0m"
                    );

                    console.log(
                        "\u001b[" + 93 + "m" + "  Token: %s, Total Borrow: %s, Total Supply: %s" + "\u001b[0m",
                        updatedToken,
                        totalBorrowStr,
                        totalSupplyStr
                    );
                } else {
                    console.error("No Updated event found for SB accumulator update");
                }
            }

            if (await utilizationOracle.canUpdate(updateData)) {
                const laUpdateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

                const updateTx = await utilizationOracle.update(laUpdateData);
                const updateReceipt = await updateTx.wait();

                // Read Updated event (if any)
                const updatedEvent = updateReceipt.events.find((event) => event.event === "Updated");
                if (updatedEvent) {
                    const updatedToken = updatedEvent.args[0];

                    const utilization = updatedEvent.args[1];
                    const error = updatedEvent.args[2];

                    // Format data
                    const utilizationStr = ethers.utils.commify(
                        ethers.utils.formatUnits(utilization, utilizationDecimals)
                    );
                    const errorStr = ethers.utils.commify(ethers.utils.formatUnits(error, utilizationDecimals));

                    console.log(
                        "\u001b[" +
                            93 +
                            "m" +
                            "UE accumulator updated. Gas used = " +
                            updateReceipt["gasUsed"] +
                            "\u001b[0m"
                    );

                    console.log(
                        "\u001b[" + 93 + "m" + "  Token: %s, Utilization: %s, Error: %s" + "\u001b[0m",
                        updatedToken,
                        utilizationStr,
                        errorStr
                    );
                } else {
                    console.error("No Updated event found for UE accumulator update");
                }
            }

            const consultation = await utilizationOracle["consultLiquidity(address)"](token);

            const tokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["tokenLiquidity"], utilizationDecimals)
            );

            const quoteTokenLiquidityStr = ethers.utils.commify(
                ethers.utils.formatUnits(consultation["quoteTokenLiquidity"], utilizationDecimals)
            );

            console.log(
                "\u001b[" + 31 + "m" + "Utilization(%s) = %s, Error(%s) = %s" + "\u001b[0m",
                tokenSymbol,
                tokenLiquidityStr,
                tokenSymbol,
                quoteTokenLiquidityStr
            );
        } catch (e) {
            console.log(e);
        }

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
