# Changelog

## v4.3.0
### Accumulators
- Add AdrastiaPriceAccumulator: An accumulator that tracks and accumulates values from Adrastia price oracles.

### Libraries
- Add StringLibrary: A library for working with strings.
  - Add function bytes32ToString: Converts bytes32 to string, stopping the conversion when we hit the null terminator or the end of the bytes.

### Oracles
- Add PythOracleView: An oracle view that reads from Pyth.
- Add DiaOracleView: An oracle view that reads from DIA.

## v4.2.0
### Oracles
- Add ChainlinkOracleView: An oracle view contract that wraps around a Chainlink feed.

### Strategies
#### Aggregation strategies
- Add MinimumAggregator: An aggregation strategy that returns the minimum price and the total token and quote token liquidity.
- Add MaximumAggregator: An aggregation strategy that returns the maximum price and the total token and quote token liquidity.

### Utils
- Add NotAnErc20: An ERC20 implementation meant to be used in Adrastia oracle contracts to provide custom quote token metadata.

## v4.1.0
### Accumulators
- Add AaveV3SBAccumulator and CometSBAccumulator
  - Allows for calculations of time-weighted average total supply and borrow amounts for Aave V3 and Compound III (Comet) pools.

## v4.0.0
### Interfaces
- Update IAccumulator
  - Add updateDelay function: Returns the minimum delay between updates.
  - Change signatures of changeThresholdSurpassed and updateThresholdSurpassed: Takes update data bytes instead of token addresses.
- Remove IAggregatedOracle: Replaced by IOracleAggregator
- Update IOracle: Removed the Updated event.
- Update ILiquidityAccumulator: The calculateLiquidity function is now a view function instead of pure.
- Update IPriceAccumulator: The calculatePrice function is now a view function instead of pure.
- Add IOracleAggregator interface in replace of IOracleAggregator (stored under contracts/oracles)
  - Adds an Oracle struct that stores decimal information and the oracle address.
  - The getOracles function now returns an array of Oracle structs for a given token. This function is no longer overloaded - the concept of general oracles and token-specific oracles has been hidden.
  - Adds an aggregationStrategy function: It's possible to have a different aggregation strategy for each different token rather than a hardcoded strategy for every token.
  - Adds a validationStrategy function: It's possible to have a different validation strategy for each different token rather than a hardcoded strategy for every token.
  - Adds a minimumResponses function: It's possible to define a minimum number of underlying oracle responses for each different token rather than a hardcoded value for every token. 
  - Adds a maximumResponseAge function: It's possible to define a maximum response age of underlying oracle observations rather than a hardcoded value for every token.
- Add IAggregationStrategy (stored under contracts/strategies/aggregation): Allows aggregation logic to be delegated to implementation contracts.
- Add IAveragingStrategy (stored under contracts/strategies/averaging): Allows averaging logic to be delegated to implementation contracts.
- Add IValidationStrategy (stored under contracts/strategies/validation): Allows for observation validation logic (of aggregators) to be delegated to implementation contracts.

### Libraries
- Update ObservationLibrary
  - Adds an ObservationMetadata struct: Includes the oracle address.
  - Adds a MetaObservation struct: Combines ObservationMetadata and Observation.
- Add SortingLibrary: A library for sorting uint112 arrays.

### Accumulators
- Update AbstractAccumulator
  - Conforms to the updated IAccumulator interface.
  - The updateThreshold function can now be easily overridden (override _updateThreshold).
- Update LiquidityAccumulator and PriceAccumulator
  - Replace the hardcoded averaging strategy with delegation to an IAveragingStrategy interface implementation.
  - Added timestamp verification to updates and updated the ValidationPerformed event to include the provided timestamp.
  - Conforms to the updated IAccumulator interface.
  - The minUpdateDelay function has been renamed to updateDelay to conform with the updated IAccumulator interface
  - The maxUpdateDelay function has been removed (replaced) in favor of the existing heartbeat function.
  - The heartbeat function can now be easily overridden (override _heartbeat).
- Remove GeometricPriceAccumulator, GeometricLiquidityAccumulator, HarmonicPriceAccumulator, HarmonicLiquidityAccumulator, and all subclasses, in favor of delegating to IAveragingStrategy interface implementations.
- Add OffchainPriceAccumulator and OffchainLiquidityAccumulator: Allows for offchain data-feeds.
- Add StaticPriceAccumulator and StaticLiquidityAccumulator: Allows accumulators to report constant values while remaining up-to-date without needing updates.
- Add lending protocol interest rate accumulators for Compound v2, Compound III (Comet), Aave v2, and Aave v3: Allows for calculations of time-weighted average interest rates.
- Add BalancerV2LiquidityAccumulator
- Add BalancerV2WeightedPriceAccumulator
- Add BalancerV2StablePriceAccumulator
- Add AlgebraPriceAccumulator
- Add AlgebraLiquidityAccumulator

### Oracles
- Add HistoricalOracle: An abstract implementation of IHistoricalOracle, pulled out of AggregatedOracle for improved readability and extension.
- Rename AggregatedOracle to PeriodicAggregatorOracle
- Add CurrentAggregatorOracle: An IOracleAggregator implementation that functions similarly to accumulators, updating based on price change percentages and heartbeats.
- Add PeriodicPriceAccumulationOracle: An oracle contract similar to PeriodicAccumulationOracle, but with liquidity as constants to save gas.
- Add AbstractAggregatorOracle: An abstract implementation of IOracleAggregator, pulled out of AggregatedOracle so that different aggregator contracts can share common logic.
- Fill buffer metadata space to allow for extension and future use.
- Add HistoricalAggregatorOracle: An abstract oracle that aggregates historical observations from another oracle that implements IHistoricalOracle.
- Add MedianFilteringOracle: An oracle that performs median filtering on the price and liquidity of another oracle that implements IHistoricalOracle.
- Add PriceVolatilityOracle: An oracle that calculates and stores the historical price volatility (using log returns) of another oracle implementing IHistoricalOracle, with the help of VolatilityOracleView.
- Add AggregationPerformed event to the oracle aggregators.
- Remove hardcoded minimum values for observations in the oracle aggregators. These checks are better served in validation strategies.
####  Oracle views
- Add AccumulatorOracleView: An oracle contract that delegates to the oracle functionality of underlying price and liquidity accumulators.
- Add VolatilityOracleView: A volatility oracle view contract that uses data from an IHistoricalOracle implementation to calculate metrics relating to historical price volatility.

### Strategies
#### Aggregation strategies
- Add AbstractAggregator: A common base for aggregation strategies.
- Add MedianAggregator: Aggregates observations to form a median price and total liquidity.
- Add MeanAggregator: Aggregates observations to form a mean price and total liquidity. It delegates the averaging logic to an IAveragingStrategy implementation.
- Add TokenWeightedMeanAggregator: Aggregates observations to form a token-weighted mean price and total liquidity.
- Add QuoteTokenWeightedMeanAggregator: Aggregates observations to form a quote token-weighted mean price and total liquidity. This is the same strategy that the old AggregatedOracle contract used.
#### Averaging strategies
- Add AbstractAveraging: A common base for averaging strategies.
- Add ArithmeticAveraging: Computes averages using the arithmetic mean.
- Add GeometricAveraging: Computes averages using the geometric mean.
- Add HarmonicAveraging: Computes averages using the harmonic mean.
- Add HarmonicAveragingWS80: Like HarmonicAveraging, but shifts weights to the left by 80 bits.
- Add HarmonicAveragingWS140: Like HarmonicAveraging, but shifts weights to the left by 140 bits.
- Add HarmonicAveragingWS192: Like HarmonicAveraging, but shifts weights to the left by 192 bits.
#### Validation strategies
- Add DefaultValidation: Validates observations against three conditions - minimum token liquidity value, minimum quote token liquidity, and liquidity distribution. It uses the same validation as the old AggregatedOracle contract.

Note: Delegation refers to the software engineering _delegation pattern_ rather than the EVM's delegation functionality.

## v3.0.0
### Interfaces
- Add IHistoricalOracle interface
- Add IHistoricalPriceAccumulationOracle interface
- Add IHistoricalLiquidityAccumulationOracle interface
- Add IPeriodic#granularity

### Oracles
- Move observation storage out of AbstractOracle
- Make AggregatedOracle implement IHistoricalOracle
- Make PeriodicAccumulationOracle implement IHistoricalPriceAccumulationOracle and IHistoricalLiquidityAccumulationOracle
- Make AggregatedOracle use an extendable ring buffer to store observations, providing up to 65535 historical observations
- Make PeriodicAccumulationOracle use an extendable ring buffer to store accumulations, providing up to 65535 historical accumulations
- Make PeriodicAccumulationOracle emit an AccumulationPushed event when a new accumulation is recorded

## v2.0.0
### Oracles
- Change PeriodicAccumulationOracle freshness metric to use accumulator heartbeats
- Add IOracle#liquidityDecimals
- Make AggregatedOracle's minimum liquidity values operate with respect to its liquidity decimals
- Bug fix: Make PeriodicAccumulationOracle discard old accumulations when updating to prevent older than desired time-weighted averages from being stored in oracle observations

### Accumulators
- Promote cumulative prices to uint224 from uint112
- Parameterize and standardize liquidity decimals
  - Rather than liquidity using the same number of decimals as the respective token, liquidity now uses the number of decimals specified in the constructor. Both the queried token and the quote token now always use the same number of decimal places.
- Introduce geometric and harmonic time-weighted averages
- Bug fix: time-weighted values are now calculated outside of unchecked blocks as overflow is not desired
- Add IAccumulator#heartbeat

## v1.0.0
### Oracles
- Require accumulators to be up-to-date when updating PeriodicAccumulationOracle
- Disallow a period of zero in PeriodicOracle
- Prevent AggregatedOracle#calculateMaxAge from returning 0
- Add AggregatedOracle#minimumResponses()
### Accumulators
- Add support for different Curve pool implementations in the Curve price and liquidity accumulators
- Add update delay validation in constructors

## v1.0.0-rc.11
### Oracles
- Fix minor issue in AggregatedOracle - validate underlying oracle observations using the aggregated oracle's quote token decimal places rather than the underlying's decimal places

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
