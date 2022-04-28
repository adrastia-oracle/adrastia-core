# Pythia Core

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
![618 out of 618 tests passing](https://img.shields.io/badge/tests-618/618%20passing-brightgreen.svg?style=flat-square)
![test-coverage 100%](https://img.shields.io/badge/test%20coverage-100%25-brightgreen.svg?style=flat-square)

Pythia Core is a set of Solidity smart contracts for building EVM oracle solutions.

## Table of contents
- [Pythia Core](#pythia-core)
  - [Table of contents](#table-of-contents)
  - [Background](#background)
  - [Install](#install)
    - [Requirements](#requirements)
    - [Recommendations](#recommendations)
    - [Procedure](#procedure)
  - [Usage](#usage)
    - [Using Solidity interfaces](#using-solidity-interfaces)
      - [Install](#install-1)
      - [Importing](#importing)
    - [Consuming oracle data](#consuming-oracle-data)
    - [Maintaining an oracle](#maintaining-an-oracle)
  - [Security](#security)
  - [Overview](#overview)
    - [High level flow chart](#high-level-flow-chart)
    - [Accumulators](#accumulators)
    - [Oracles](#oracles)
  - [Limitations](#limitations)
    - [Accumulators](#accumulators-1)
      - [Cumulative value overflows and underflows](#cumulative-value-overflows-and-underflows)
  - [Assumptions](#assumptions)
  - [Contributing](#contributing)
  - [License](#license)
    - [Exceptions](#exceptions)

## Background

To build reliaible decentralized financial applications, reliable price feeds are often needed. Since most, if not all, DeFi applications are fully automatic with large amounts of capital at stake, these price feeds must also have the highest degree of security and accuracy.

The current standard in DeFi is to use trusted and centralized price oracle solutions that push off-chain data on-chain, which has its risks. These risks relate to:
- Centralized exchanges risks
  - Downtimes
  - User lockouts
  - Bugs
  - Accuracy and integrity of the closed source systems
- Data source reliability, accuracy, and availability
- Bug-free code to read from these sources and post on-chain with all intermediate calculations for each and every price reporter (of which may be closed source)
- Price reporters must not collude to report inaccurate prices
- Price reporters must maintain the highest level of physical and digital security to protect their code and keys from attacks

Pythia is designed to mitigate these risks by keeping everything on-chain - prices are only ever read from decentralized exchanges that have the highest levels of availability, transparency, and censorship-resistance. While Pythia may still be susceptible to bugs and errors, the likeliness of them happening is minimized by:
- Clean code
- Keeping everything open-source
- Having the code professionally audited
- Minimizing (or even eliminating) the need for trust
- Ensuring high immutability in the contracts
- Rigorous and thorough testing with 100% test coverage
- And more

Furthermore, while it's still possible to manipulate on-chain prices, the presence of arbitrageurs, MEV, and regular users makes doing so incredibly costly. The further use of TWAPs (time-weighted average prices) increases the cost exponentially by allowing arbitrageurs time to move funds between exchanges and profit greatly from trading. Please read [this related paper](https://github.com/pythia-oracle/uni-v3-twap-manipulation/blob/master/cost-of-attack.pdf) on the topic.

Assuming the precense of arbitrageurs, MEV, on/off ramps and bridges, and someone (anyone) to call Pythia's simple update functions, Pythia therefore delivers the highest level of secure, accurate, and reliable price feeds.

## Install

### Requirements

- node: v14 or later
- yarn
- git

### Recommendations

- Operating system: Linux (Fedora is used for development and testing)

### Procedure

1. Clone the repository

```console
git clone git@github.com:pythia-oracle/pythia-core.git
```

2. Enter the project folder

```console
cd pythia-core
```

3. Install using yarn (npm should work too)

```console
yarn install --lock-file
```

## Usage

### Using Solidity interfaces

The Pythia Core interfaces are available for import into Solidity smart contracts via the npm artifact `@pythia-oracle/pythia-core`.

#### Install

```console
yarn add @pythia-oracle/pythia-core
```
or
```console
npm install @pythia-oracle/pythia-core
```

#### Importing

```solidity
import '@pythia-oracle/pythia-core/contracts/interfaces/IOracle.sol';

contract PriceConsumer {
  IOracle oracle = IOracle(...);

  function doSomethingWithPrice() external {
    uint256 price = oracle.consultPrice(...);
  }
}
```

### Consuming oracle data

To consume data from deployed oracles, import the one of the interfaces that the oracle contract implements, then call one of the consult functions.

### Maintaining an oracle

Oracles need maintenance - they need someone to call the update functions of the oracle and all underlying components. Please refer to one of the scripts found in `scripts/` for example code.

## Security

If any security vulnerabilities are found, please contact us via Discord (TylerEther#8944) or email (tyler@trilez.com).

## Overview

### High level flow chart
![High level flow chart](/assets/images/high-level-flow-chart.png)

### Accumulators

Accumulators (`contracts/accumulators/`) are designed to track changing values such as prices and liquidities, allowing for time-weighted averages to be calculated from two unique accumulations. They also have a dual function of being spot oracles - that is, oracles that provide current values for whatever is being consulted.

### Oracles

Oracles (`contracts/oracles/`) are designed to record observations to later provide consulations against these observations with a focus on gas efficiency when consulting. They typically update periodically and utilize time-weighted averages derived from accumulators to provide higher levels of manipulation resistance.

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

## Contributing

Please refer to the [contributing guide](CONTRIBUTING.md).

## License

Pythia Core is licensed under the [MIT License](LICENSE).

### Exceptions

- The file located at [contracts/libraries/uniswap-lib/FullMath.sol](contracts/libraries/uniswap-lib/FullMath.sol) is licensed under a different [MIT License](contracts/libraries/uniswap-lib/LICENSE_MIT).