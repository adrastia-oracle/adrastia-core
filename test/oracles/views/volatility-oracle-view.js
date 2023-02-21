const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const validPrecisionDecimals = [1, 2, 8];

const validMeanTypes = {
    geometric: 0,
    arithmetic: 1,
};

const observationsVolatility = [
    // Observations are in reverse chronological order (latest first)
    {
        // index 0
        observations: [
            {
                price: 0,
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: 0,
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: 0,
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 0,
            arithmetic: 0,
        },
        meanReturnRate: {
            geometric: 0,
            arithmetic: 0,
        },
    },
    {
        // index 1
        observations: [
            {
                price: 1,
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: 1,
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: 1,
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 0,
            arithmetic: 0,
        },
        meanReturnRate: {
            geometric: 0,
            arithmetic: 0,
        },
    },
    {
        // index 2
        observations: [
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 0,
            arithmetic: 0,
        },
        meanReturnRate: {
            geometric: 0,
            arithmetic: 0,
        },
    },
    {
        // index 3
        observations: [
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1000", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("100", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("15", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 534.652249389992,
            arithmetic: 400.302203549602,
        },
        meanReturnRate: {
            geometric: 0.0,
            arithmetic: 354.416666666667,
        },
    },
    {
        // index 4
        observations: [
            {
                price: ethers.utils.parseUnits("10", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1000", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("100", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("15", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("10", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 534.652249389992,
            arithmetic: 400.302203549602,
        },
        meanReturnRate: {
            geometric: 0.0,
            arithmetic: 354.416666666667,
        },
    },
    {
        // index 5
        observations: [
            {
                price: ethers.utils.parseUnits("32", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("16", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("8", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("4", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 4),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 0,
            arithmetic: 0,
        },
        meanReturnRate: {
            geometric: 100.0,
            arithmetic: 100.0,
        },
    },
    {
        // index 6
        observations: [
            {
                price: ethers.utils.parseUnits("32", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("16", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("8", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("4", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 0,
            arithmetic: 0,
        },
        meanReturnRate: {
            geometric: 100.0,
            arithmetic: 100.0,
        },
    },
    {
        // index 7
        observations: [
            {
                price: ethers.utils.parseUnits("3", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("3", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("3.1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("3", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 21.8382965577488,
            arithmetic: 21.7590548727639,
        },
        meanReturnRate: {
            geometric: 10.6681919700321,
            arithmetic: 12.5268817204301,
        },
    },
    {
        // index 8
        observations: [
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("20", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 452.24440295044,
            arithmetic: 404.374517001257,
        },
        meanReturnRate: {
            geometric: 0.0,
            arithmetic: 202.5,
        },
    },
    {
        // index 9
        observations: [
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 37.0444472947948,
            arithmetic: 34.6410161513776,
        },
        meanReturnRate: {
            geometric: -33.1259695023578,
            arithmetic: -20.0,
        },
    },
    {
        // index 10
        observations: [
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 180.407118834455,
            arithmetic: 173.205080756888,
        },
        meanReturnRate: {
            geometric: 49.5348781221221,
            arithmetic: 100.0,
        },
    },
    {
        // index 11
        observations: [
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("11", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("12", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("7", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("9", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("4.564", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("3", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("200", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("12", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("62", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("14.3765", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("9.2", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("13", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("13", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("13", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("15", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("8", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("3", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("19", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("16", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("18", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("16.55555", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("19.6", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("17", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("13", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("10", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("200", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 302.279671904845,
            arithmetic: 290.122169278836,
        },
        meanReturnRate: {
            geometric: -9.50338528553043,
            arithmetic: 75.3619606446159,
        },
    },
    {
        // index 12
        observations: [
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 0,
            arithmetic: 0,
        },
        meanReturnRate: {
            geometric: 0,
            arithmetic: 0,
        },
    },
    {
        // index 13
        observations: [
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("100", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
            {
                price: ethers.utils.parseUnits("1", 18),
                tokenLiquidity: 0,
                quoteTokenLiquidity: 0,
                timestamp: 0,
            },
        ],
        volatility: {
            geometric: 1043.60380413258,
            arithmetic: 1037.90639751376,
        },
        meanReturnRate: {
            arithmetic: 108.9,
            geometric: 0,
        },
    },
];

describe("VolatilityOracleView#constructor", async function () {
    var factory;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("VolatilityOracleView");
    });

    for (const precisionDecimals of validPrecisionDecimals) {
        it(`should deploy with precisionDecimals=${precisionDecimals}`, async () => {
            const contract = await factory.deploy(precisionDecimals);
            await contract.deployed();

            expect(await contract.precisionFactor()).to.equal(BigNumber.from(10).pow(precisionDecimals));
        });
    }
});

describe("VolatilityOracleView#priceChangeVolatility", async function () {
    var oracle;
    var volatilityOracle;

    for (const precisionDecimals of validPrecisionDecimals) {
        describe(`precisionDecimals=${precisionDecimals}`, async function () {
            beforeEach(async () => {
                const factory = await ethers.getContractFactory("VolatilityOracleView");
                volatilityOracle = await factory.deploy(precisionDecimals);
                await volatilityOracle.deployed();

                const oracleFactory = await ethers.getContractFactory("MockHistoricalOracle");
                oracle = await oracleFactory.deploy();
                await oracle.deployed();
            });

            for (const meanType of Object.keys(validMeanTypes)) {
                describe(`meanType=${meanType}`, async function () {
                    it("Should revert if we try to calculate volatility for 0 prices", async () => {
                        await expect(
                            volatilityOracle.priceChangeVolatility(
                                oracle.address,
                                USDC,
                                0 /* numObservations */,
                                0 /* offset */,
                                1 /* increment */,
                                validMeanTypes[meanType]
                            )
                        ).to.be.revertedWith("TooFewObservations");
                    });

                    it("Should revert if we try to calculate volatility for only 1 price", async () => {
                        await expect(
                            volatilityOracle.priceChangeVolatility(
                                oracle.address,
                                USDC,
                                1 /* numObservations */,
                                0 /* offset */,
                                1 /* increment */,
                                validMeanTypes[meanType]
                            )
                        ).to.be.revertedWith("TooFewObservations");
                    });

                    it("Should revert if we try to use an invalid mean type", async () => {
                        const observations = [
                            {
                                price: ethers.utils.parseUnits("1", 18),
                                tokenLiquidity: 0,
                                quoteTokenLiquidity: 0,
                                timestamp: 0,
                            },
                            {
                                price: ethers.utils.parseUnits("1", 18),
                                tokenLiquidity: 0,
                                quoteTokenLiquidity: 0,
                                timestamp: 0,
                            },
                            {
                                price: ethers.utils.parseUnits("1", 18),
                                tokenLiquidity: 0,
                                quoteTokenLiquidity: 0,
                                timestamp: 0,
                            },
                        ];

                        await oracle.stubSetObservations(USDC, observations);

                        await expect(
                            volatilityOracle.meanPriceChangePercent(
                                oracle.address,
                                USDC,
                                2 /* numObservations */,
                                0 /* offset */,
                                1 /* increment */,
                                2 /* invalid mean type */
                            )
                        ).to.be.revertedWith("InvalidMeanType");
                    });

                    for (var i = 0; i < observationsVolatility.length; ++i) {
                        const test = observationsVolatility[i];

                        const allowedError = 2000 / 10 ** precisionDecimals;

                        it(`${test.observations.length} observations' (index ${i}) volatility = ~${test.volatility[meanType]}% (allowed error = ${allowedError}%)`, async () => {
                            await oracle.stubSetObservations(USDC, test.observations);

                            const volatility = await volatilityOracle.priceChangeVolatility(
                                oracle.address,
                                USDC,
                                test.observations.length - 1,
                                0 /* offset */,
                                1 /* increment */,
                                validMeanTypes[meanType]
                            );

                            const volatilityPercentage = (volatility.toNumber() * 100) / 10 ** precisionDecimals;

                            expect(volatilityPercentage).to.be.closeTo(test.volatility[meanType], allowedError);
                        });
                    }
                });
            }
        });
    }
});

describe("VolatilityOracleView#meanPriceChangePercent", async function () {
    var oracle;
    var volatilityOracle;

    for (const precisionDecimals of validPrecisionDecimals) {
        describe(`precisionDecimals=${precisionDecimals}`, async function () {
            beforeEach(async () => {
                const factory = await ethers.getContractFactory("VolatilityOracleView");
                volatilityOracle = await factory.deploy(precisionDecimals);
                await volatilityOracle.deployed();

                const oracleFactory = await ethers.getContractFactory("MockHistoricalOracle");
                oracle = await oracleFactory.deploy();
                await oracle.deployed();
            });

            for (const meanType of Object.keys(validMeanTypes)) {
                describe(`meanType=${meanType}`, async function () {
                    it("Should revert if we try to calculate mean RR for 0 prices", async () => {
                        await expect(
                            volatilityOracle.meanPriceChangePercent(
                                oracle.address,
                                USDC,
                                0 /* numObservations */,
                                0 /* offset */,
                                1 /* increment */,
                                validMeanTypes[meanType]
                            )
                        ).to.be.revertedWith("TooFewObservations");
                    });

                    it("Should revert if we try to calculate mean RR for only 1 price", async () => {
                        await expect(
                            volatilityOracle.meanPriceChangePercent(
                                oracle.address,
                                USDC,
                                1 /* numObservations */,
                                0 /* offset */,
                                1 /* increment */,
                                validMeanTypes[meanType]
                            )
                        ).to.be.revertedWith("TooFewObservations");
                    });

                    it("Should revert if we try to use an invalid mean type", async () => {
                        const observations = [
                            {
                                price: ethers.utils.parseUnits("1", 18),
                                tokenLiquidity: 0,
                                quoteTokenLiquidity: 0,
                                timestamp: 0,
                            },
                            {
                                price: ethers.utils.parseUnits("1", 18),
                                tokenLiquidity: 0,
                                quoteTokenLiquidity: 0,
                                timestamp: 0,
                            },
                            {
                                price: ethers.utils.parseUnits("1", 18),
                                tokenLiquidity: 0,
                                quoteTokenLiquidity: 0,
                                timestamp: 0,
                            },
                        ];

                        await oracle.stubSetObservations(USDC, observations);

                        await expect(
                            volatilityOracle.meanPriceChangePercent(
                                oracle.address,
                                USDC,
                                2 /* numObservations */,
                                0 /* offset */,
                                1 /* increment */,
                                2 /* invalid mean type */
                            )
                        ).to.be.revertedWith("InvalidMeanType");
                    });

                    for (var i = 0; i < observationsVolatility.length; ++i) {
                        const test = observationsVolatility[i];

                        const allowedError = 5000 / 10 ** precisionDecimals;

                        it(`${test.observations.length} observations' (index ${i}) mean RR = ~${test.meanReturnRate[meanType]}% (allowed error = ${allowedError}%)`, async () => {
                            await oracle.stubSetObservations(USDC, test.observations);

                            const meanReturnRate = await volatilityOracle.meanPriceChangePercent(
                                oracle.address,
                                USDC,
                                test.observations.length - 1,
                                0 /* offset */,
                                1 /* increment */,
                                validMeanTypes[meanType]
                            );

                            const meanReturnRatePercentage =
                                (meanReturnRate.toNumber() * 100) / 10 ** precisionDecimals;

                            expect(meanReturnRatePercentage).to.be.closeTo(test.meanReturnRate[meanType], allowedError);
                        });
                    }
                });
            }
        });
    }
});
