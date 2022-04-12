# Pythia (Oracle of Ethereum)

Pythia is a library of on-chain oracle solutions for the EVM.

## Overview

![High level flow chart](/assets/images/high-level-flow-chart.png)

## Limitations

### Accumulators

#### Cumulative value overflows and underflows

While overflows and underflows in the math relating to cumulative values [usually] results in correct calculations, there's a scenario where it does not.

Say the math is performed using 224 bit numbers. If the difference between two cumulative values is greater than or equal to 2^112, we run into a problem. Since we're using 112 bit numbers, the **difference** will overflow/underflow. It's okay for the cumulative values to overflow/underflow, but not the difference.

Let's say we're using cumulative prices, and the first cumulative price is equal to 2^56. Then say the second cumulative value overflows, going back to zero, then eventually going to 2^56 again and this value is used in calculations. The difference between these two cumulative prices is 0, and the TWAP calculated will be equal to `0/deltaTime = 0`. This is incorrect, and the correct TWAP is actually `2^112/deltaTime`. Since the **difference** overflowed, the result is incorrect.

When using accumulators, make sure to calculate the maximum period (deltaTime) that can be used with the maximum level of price/liquidity/value that can be reasonably expected. Also take note that the period (deltaTime) is optimistic and could become larger than expected if the accumulator is not being updated frequently enough.

Example using a liquidity accumulator for COMP with a fixed total supply of 10,000,000 and 18 decimal places. Let's say that the maximum amount of COMP we can reasonably expect in a DEX pool is 10% of the total supply. Then the maximum deltaTime before we run into problems is equal to `deltaTime = 2^112/(1,000,000*10^18) = 5192296858` seconds, or about 164 years.

## Assumptions

- `liquidity <= 1,000,000,000*10^18` (w/ 18 decimal places)
  - Liquidities can be stored in 112 bit numbers
- `deltaTime < 5192296` (60 days)
  - Maximum time between two accumulations
- `block.timestamp < 4294967296` (Feb 2106)
  - Timestamps can be stored in 32 bit numbers