// We require the Hardhat Runtime Environment explicitly here. This is optional 
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const hre = require("hardhat");

const ethers = hre.ethers;

const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const uniswapV3FactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const sushiswapFactoryAddress = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac";

const wethAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
const usdcAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const grtAddress = "0xc944e90c64b2c07662a292be6244bdf05cda44a7";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createContract(name, ...deploymentArgs) {
  const contractFactory = await ethers.getContractFactory(name);

  const contract = await contractFactory.deploy(...deploymentArgs);

  await contract.deployed();

  return contract;
}

async function createUniswapV2DataSource(factory, baseToken) {
  return createContract("UniswapV2DataSource", factory, baseToken);
}

async function createUniswapV3DataSource(factory, baseToken, poolFee, observationPeriod) {
  return createContract("UniswapV3DataSource", factory, baseToken, poolFee, observationPeriod);
}

async function createSushiswapDataSource(factory, baseToken) {
  return createContract("UniswapV2DataSource", factory, baseToken);
}

async function main() {
  const token = "0xe53ec727dbdeb9e2d5456c3be40cff031ab40a55";
  const baseToken = wethAddress;

  const uniswapV2DataSource = await createUniswapV2DataSource(uniswapV2FactoryAddress, baseToken);
  const uniswapV3DataSource = await createUniswapV3DataSource(uniswapV3FactoryAddress, baseToken, 3000, 10);
  const sushiswapDataSource = await createSushiswapDataSource(sushiswapFactoryAddress, baseToken);

  const priceStrategy = await createContract("TwapStrategy");
  const liquidityStrategy = await createContract("TwalStrategy");
  const weightedLiquidityAggregationStrategy = await createContract("WeightedLiquidityAggregationStrategy", false); // Weight by base liquidity

  const observationPeriodSeconds = 16;
  const observationGranularity = 2;

  const uniswapV2Oracle = await createContract("SlidingWindowOracle", uniswapV2DataSource.address, priceStrategy.address, liquidityStrategy.address, baseToken, observationPeriodSeconds, observationGranularity);
  const uniswapV3Oracle = await createContract("SlidingWindowOracle", uniswapV3DataSource.address, priceStrategy.address, liquidityStrategy.address, baseToken, observationPeriodSeconds, observationGranularity);
  const sushiswapOracle = await createContract("SlidingWindowOracle", sushiswapDataSource.address, priceStrategy.address, liquidityStrategy.address, baseToken, observationPeriodSeconds, observationGranularity);

  const aggregatedOracle = await createContract("AggregatedOracle", weightedLiquidityAggregationStrategy.address,
    [ uniswapV2Oracle.address, uniswapV3Oracle.address, sushiswapOracle.address ]);

  const cachedAggregatedOracle = await createContract("CachingCompositeOracle", aggregatedOracle.address);

  while (true) {
    await uniswapV2Oracle.update(token);
    await uniswapV3Oracle.update(token);
    await sushiswapOracle.update(token);

    await cachedAggregatedOracle.update(token);

    try {
      const result = await uniswapV2Oracle.consult(token);

      console.log("UniswapV2 Price =", result['price'].toString(), ", Token Liquidity =", result['tokenLiquidity'].toString(), ", Base Liquidity =", result['baseLiquidity'].toString());
    } catch (e) {
      console.log(e);
    }

    try {
      const result = await uniswapV3Oracle.consult(token);

      console.log("UniswapV3 Price =", result['price'].toString(), ", Token Liquidity =", result['tokenLiquidity'].toString(), ", Base Liquidity =", result['baseLiquidity'].toString());
    } catch (e) {
      console.log(e);
    }

    try {
      const result = await sushiswapOracle.consult(token);

      console.log("Sushiswap Price =", result['price'].toString(), ", Token Liquidity =", result['tokenLiquidity'].toString(), ", Base Liquidity =", result['baseLiquidity'].toString());
    } catch (e) {
      console.log(e);
    }

    try {
      const estimation = await aggregatedOracle.estimateGas.consult(token);

      console.log(estimation.toString());

      const result = await aggregatedOracle.consult(token);

      console.log("Aggregate Price =", result['price'].toString(), ", Token Liquidity =", result['tokenLiquidity'].toString(), ", Base Liquidity =", result['baseLiquidity'].toString());
    } catch (e) {
      console.log(e);
    }

    try {
      const estimation = await cachedAggregatedOracle.estimateGas.consult(token);

      console.log(estimation.toString());

      const result = await cachedAggregatedOracle.consult(token);

      console.log("Aggregate Price =", result['price'].toString(), ", Token Liquidity =", result['tokenLiquidity'].toString(), ", Base Liquidity =", result['baseLiquidity'].toString());
    } catch (e) {
      console.log(e);
    }

    await sleep(1000);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
