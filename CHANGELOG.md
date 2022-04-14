# Changelog

## v1.0.0-rc.5
### Global
- Use uint112 for prices and liquidities
- Change Updated events

### Interfaces
- Add function IUpdateByToken#canUpdate

### Accumulators
- Add observation validation mechanics to accumulators
- Require in-range liquidity with UniswapV3LiquidityAccumulator
- Add UniswapV2PriceAccumulator and UniswapV3PriceAccumulator
  - These use spot prices rather than Uniswap's own oracle mechanics
- Make price accumulators report a price of 1 when it's in-fact 0
- Make PriceAccumulator implement IPriceOracle
- Make LiquidityAccumulator implement ILiquidityOracle

### Oracles
- Make AggregatedOracle more strict with the age of underlying oracles' consultations
- Remove UniswapV2Oracle and UniswapV3Oracle

### Libraries
- Upgrade FullMath to use solc v0.8.11
- Remove Uniswap library contracts other than FullMath

### Utils
- Add SimpleQuotationMetadata and ExplicitQuotationMetadata
