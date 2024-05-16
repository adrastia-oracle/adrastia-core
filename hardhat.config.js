require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("hardhat-gas-reporter");
// require("hardhat-tracer");
require("@atixlabs/hardhat-time-n-mine");
require("hardhat-contract-sizer");
require("@nomiclabs/hardhat-etherscan");

const SOLC_8 = {
    version: "0.8.13",
    settings: {
        optimizer: {
            enabled: true,
            runs: 2000,
        },
    },
};

const SOLC_7 = {
    version: "0.7.6",
    settings: {
        optimizer: {
            enabled: true,
            runs: 2000,
        },
    },
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        compilers: [SOLC_8, SOLC_7],
        overrides: {
            "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol": SOLC_7,
            "@uniswap/v3-core/contracts/libraries/FullMath.sol": SOLC_7,
            "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol": SOLC_7,
            "@uniswap/v3-core/contracts/libraries/TickMath.sol": SOLC_7,
            "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol": SOLC_7,
            "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol": SOLC_7,
            "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol": SOLC_7,
            "@uniswap/v3-periphery/contracts/libraries/CallbackValidation.sol": SOLC_7,
            "@uniswap/v3-core/contracts/base/LiquidityManagement.sol": SOLC_7,
            "@uniswap/v3-core/contracts/base/PeripheryPayments.sol": SOLC_7,
            "@uniswap/v3-core/contracts/base/PeripheryImmutableState.sol": SOLC_7,
        },
    },
    networks: {
        hardhat: {
            gas: 10000000,
            hardfork: process.env.HARDHAT_HARDFORK || "shanghai",
            forking: {
                url: process.env.ETHEREUM_URL || "",
                blockNumber: 17500000,
            },
            mining: {
                auto: true,
                mempool: {
                    order: "fifo",
                },
            },
            blockGasLimit: 20000000000,
            accounts: {
                accountsBalance: "1000000000000000000000000", // 1M ETH
            },
        },
        polygon: {
            chainId: 137,
            url: process.env.POLYGON_URL || "",
        },
        polygonZkEVM: {
            chainId: 1101,
            url: process.env.POLYGONZKEVM_URL || "",
        },
        arbitrumOne: {
            chainId: 42161,
            url: process.env.ARBITRUMONE_URL || "",
        },
        optimisticEthereum: {
            chainId: 10,
            url: process.env.OPTIMISM_URL || "",
        },
        evmos: {
            chainId: 9001,
            url: process.env.EVMOS_URL || "",
        },
        mode: {
            chainId: 34443,
            url: process.env.MODE_URL || "",
        },
    },
    etherscan: {
        apiKey: {
            mainnet: process.env.ETHERSCAN_API_KEY,
            polygon: process.env.POLYGONSCAN_API_KEY,
            polygonZkEVM: process.env.POLYGONSCANZKEVM_API_KEY,
            arbitrumOne: process.env.ARBISCAN_API_KEY,
            optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY,
            evmos: process.env.ESCAN_API_KEY,
            mode: "placeholder",
        },
        customChains: [
            {
                network: "polygonZkEVM",
                chainId: 1101,
                urls: {
                    apiURL: "https://api-zkevm.polygonscan.com/api",
                    browserURL: "https://zkevm.polygonscan.com",
                },
            },
            {
                network: "evmos",
                chainId: 9001,
                urls: {
                    apiURL: "https://escan.live/api",
                    browserURL: "https://escan.live",
                },
            },
            {
                network: "mode",
                chainId: 34443,
                urls: {
                    apiURL: "https://explorer.mode.network/api",
                    browserURL: "https://explorer.mode.network",
                },
            },
        ],
    },
    mocha: {
        timeout: 60000, // 60 seconds
    },
};
