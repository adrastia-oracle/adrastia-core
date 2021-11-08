require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-tracer");
require("@atixlabs/hardhat-time-n-mine");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
    const accounts = await ethers.getSigners();

    for (const account of accounts) {
        console.log(account.address);
    }
});

const UNISWAP_V3_CORE_COMPILER = {
    version: "0.7.6",
    settings: {
        optimizer: {
            enabled: true,
            runs: 800,
        },
        metadata: {
            // do not include the metadata hash, since this is machine dependent
            // and we want all generated code to be deterministic
            // https://docs.soliditylang.org/en/v0.7.6/metadata.html
            bytecodeHash: "none",
        },
    },
};

const UNISWAP_V3_PERIPHERY_COMPILER = {
    version: "0.7.6",
    settings: {
        optimizer: {
            enabled: true,
            runs: 1_000_000,
        },
        metadata: {
            // do not include the metadata hash, since this is machine dependent
            // and we want all generated code to be deterministic
            // https://docs.soliditylang.org/en/v0.7.6/metadata.html
            bytecodeHash: "none",
        },
    },
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        compilers: [
            {
                version: "0.8.5",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 20000,
                    },
                },
            },
            {
                version: "0.7.6",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 20000,
                    },
                },
            },
            {
                version: "0.6.6",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 20000,
                    },
                },
            },
            {
                version: "0.5.16",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 20000,
                    },
                },
            },
        ],
        overrides: {
            "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol": UNISWAP_V3_CORE_COMPILER,
            "@uniswap/v3-core/contracts/libraries/FullMath.sol": UNISWAP_V3_CORE_COMPILER,
            "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol": UNISWAP_V3_CORE_COMPILER,
            "@uniswap/v3-core/contracts/libraries/TickMath.sol": UNISWAP_V3_CORE_COMPILER,
            "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol": UNISWAP_V3_PERIPHERY_COMPILER,
            "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol": UNISWAP_V3_PERIPHERY_COMPILER,
            "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol": UNISWAP_V3_PERIPHERY_COMPILER,
            "@uniswap/v3-periphery/contracts/libraries/CallbackValidation.sol": UNISWAP_V3_PERIPHERY_COMPILER,
            "@uniswap/v3-core/contracts/base/LiquidityManagement.sol": UNISWAP_V3_PERIPHERY_COMPILER,
            "@uniswap/v3-core/contracts/base/PeripheryPayments.sol": UNISWAP_V3_PERIPHERY_COMPILER,
            "@uniswap/v3-core/contracts/base/PeripheryImmutableState.sol": UNISWAP_V3_PERIPHERY_COMPILER,
        },
    },
    networks: {
        hardhat: {
            hardfork: "london",
            gasPrice: "auto",
            forking: {
                url: "https://eth-mainnet.alchemyapi.io/v2/VCgYDancQJkTUUroC021s8qizSktMDQJ",
                blockNumber: 13567142,
            },
        },
    },
};
