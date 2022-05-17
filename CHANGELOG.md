# Changelog

## v1.0.0-rc.10
### Global
- Upgrade solc from v0.8.11 to v0.8.13
- Upgrade dependencies to latest versions

### Oracles
- Add aggregation restrictions to AggregatedOracle
  - For each and every underlying oracle:
    - Add ability to enforce minimum token liquidity value
    - Add ability to enforce minimum quote token liquidity
    - Add enforcement of TVL distribution ratio between the token and the quote token (must be between 10:1 and 1:10)

## v1.0.0-rc.9
### Interfaces
- Change the spec of oracle consultations where using a max age of 0 will return data as of the latest block, straight from the source

### Oracles
- Improve price calculation precision of AggregatedOracle
- Add PeriodicAccumulationOracle#canUpdate that returns false when one or both of the accumulators are uninitialized
- Make PeriodicAccumulationOracle#update return true only if something was updated
- Update AggregatedOracle and PeriodicAccumulation oracle to conform to the new oracle spec

### Accumulators
- Improve price calculation precision of UniswapV3PriceAccumulator
- Add observation validation logs

## v1.0.0-rc.8
### Interfaces
- Add IUpdateable#lastUpdateTime and IUpdateable#timeSinceLastUpdate
- Add IAccumulator to define common functions
- Remove `getLastObservation` and `getCurrentObservation` from accumulators

### Accumulators
- Initialize accumulators when initializing instead of just the observation
- Validate all observations instead of only the ones after the first update
- Add AbstractAccumulator to define common logic and reduce redundancy
- Add convenience functions: `changeThresholdSurpassed(address token, uint256 changeThreshold)` and `updateThresholdSurpassed(address token)`
- Make consultations use stored observations by default, rather than returning data directly from the source
  - A `maxAge` of 0 allows for the consultation to return data directly from the source

### Oracles
- Make PeriodicAccumulationOracle only update observation timestamp and emit Updated when it has enough information to calculate a price

### Libraries
 - Remove unused UniswapV2PriceAccumulator data structure

## v1.0.0-rc.7
### Accumulators
- Add observation validation against externally provided data (MEV and flashbot attack protection)

## v1.0.0-rc.6
### Interfaces
- Make IUpdateByToken#update public
- Rename IUpdateByToken to IUpdateable and replace `address token` with `bytes memory data`

### Accumulators
- Remove use of pending observations

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
