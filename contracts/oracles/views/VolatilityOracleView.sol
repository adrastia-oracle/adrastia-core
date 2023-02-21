//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@prb/math/contracts/PRBMathSD59x18.sol";

import "../../interfaces/IHistoricalOracle.sol";

contract VolatilityOracleView {
    using PRBMathSD59x18 for int256;

    uint256 public immutable precisionFactor;

    uint256 public constant MEAN_TYPE_GEOMETRIC = 0;
    uint256 public constant MEAN_TYPE_ARITHMETIC = 1;

    error TooFewObservations(uint256 numObservations, uint256 minObservations);
    error InvalidMeanType(uint256 meanType);

    constructor(uint256 precisionDecimals_) {
        // TODO: Check that precisionDecimals_ is not too large
        precisionFactor = 10 ** precisionDecimals_;
    }

    function priceChangeVariance(
        IHistoricalOracle oracle,
        address asset,
        uint256 numObservations,
        uint256 offset,
        uint256 increment,
        uint256 meanType
    ) public view returns (uint256) {
        int256[] memory deltas = priceChangePercentages(oracle, asset, numObservations, offset, increment);

        int256 avg = average(deltas, meanType);

        return variance(deltas, avg);
    }

    function priceChangeVolatility(
        IHistoricalOracle oracle,
        address asset,
        uint256 numObservations,
        uint256 offset,
        uint256 increment,
        uint256 meanType
    ) public view returns (uint256) {
        return sqrt(priceChangeVariance(oracle, asset, numObservations, offset, increment, meanType));
    }

    function meanPriceChangePercent(
        IHistoricalOracle oracle,
        address asset,
        uint256 numObservations,
        uint256 offset,
        uint256 increment,
        uint256 meanType
    ) public view returns (int256) {
        int256[] memory deltas = priceChangePercentages(oracle, asset, numObservations, offset, increment);

        return average(deltas, meanType);
    }

    function priceChangePercentages(
        IHistoricalOracle oracle,
        address asset,
        uint256 numObservations,
        uint256 offset,
        uint256 increment
    ) public view returns (int256[] memory) {
        if (numObservations < 2) revert TooFewObservations(numObservations, 2);

        numObservations++; // We need n+1 observations to calculate n price changes

        ObservationLibrary.Observation[] memory observations = oracle.getObservations(
            asset,
            numObservations,
            offset,
            increment
        );

        int256 latestPrice = int256(uint256(observations[0].price));
        if (latestPrice == 0) {
            // We don't allow prices of 0
            latestPrice = 1;
        }

        int256[] memory deltas = new int256[](numObservations - 1);

        for (uint256 i = 1; i < numObservations; ++i) {
            // Since observations is in reverse chronological order, this price is older than latestPrice
            int256 price = int256(uint256(observations[i].price));

            if (price == 0) {
                // If the price is 0, we can't calculate a percentage change, so we set it to the lowest possible value
                price = 1;
            }

            // Absolute value of the difference between the two prices
            int256 difference = latestPrice - price;
            // Absolute value of the difference between the two prices, expressed as a percentage of the older price
            int256 percentDifference = (difference * int256(precisionFactor)) / price;

            deltas[i - 1] = percentDifference;

            latestPrice = price;
        }

        return deltas;
    }

    function am(int256[] memory values) internal pure returns (int256) {
        int256 sum = 0;
        for (uint256 i = 0; i < values.length; ++i) {
            sum += values[i];
        }
        return sum / int256(values.length);
    }

    function gm(int256[] memory values) internal view returns (int256) {
        // ln(x) is undefined for x <= 0, so we need to offset all values to ensure that they are positive
        // We know the largest drawdown is -100%, so we can offset by 100% + 1
        int256 offset = int256(precisionFactor) + 1;
        int256 sum = 0;
        for (uint256 i = 0; i < values.length; ++i) {
            sum += (values[i] + offset).fromInt().ln();
        }
        return (sum / int256(values.length)).exp().toInt() - offset;
    }

    function average(int[] memory values, uint256 meanType) internal view returns (int256) {
        if (meanType == MEAN_TYPE_ARITHMETIC) {
            return am(values);
        } else if (meanType == MEAN_TYPE_GEOMETRIC) {
            return gm(values);
        } else {
            revert InvalidMeanType(meanType);
        }
    }

    function variance(int256[] memory values, int256 avg) internal pure returns (uint256) {
        // Calculate variance
        uint256 v = 0;
        for (uint256 i = 0; i < values.length; ++i) {
            int256 difference = values[i] - avg;
            v += uint256(difference ** 2);
        }
        v /= values.length;

        return v;
    }

    // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
