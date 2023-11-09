// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@prb/math/contracts/PRBMathSD59x18.sol";

import "../../interfaces/IHistoricalOracle.sol";

/// @title VolatilityOracleView
/// @notice A view contract that calculates volatility from a historical oracle.
contract VolatilityOracleView {
    using PRBMathSD59x18 for int256;

    /// @notice The precision factor to use for calculations and results. Equal to 10^precisionDecimals.
    uint256 public immutable precisionFactor;

    /// @notice Used to indicate that the geometric mean should be used.
    uint256 public constant MEAN_TYPE_GEOMETRIC = 0;

    /// @notice Used to indicate that the arithmetic mean should be used.
    uint256 public constant MEAN_TYPE_ARITHMETIC = 1;

    /// @notice An error thrown when the oracle has less observations than the minimum required.
    /// @param numObservations The number of observations the oracle has.
    /// @param minObservations The minimum number of observations required.
    error TooFewObservations(uint256 numObservations, uint256 minObservations);

    /// @notice An error thrown when an invalid mean type is specified.
    /// @param meanType The invalid mean type.
    error InvalidMeanType(uint256 meanType);

    /// @notice Constructs a new VolatilityOracleView contract.
    /// @param precisionDecimals_ The number of decimals to use for precision. Only tested up to 8.
    constructor(uint256 precisionDecimals_) {
        // TODO: Check that precisionDecimals_ is not too large
        precisionFactor = 10 ** precisionDecimals_;
    }

    /// @notice Calculates the return rate variance of an asset over a given number of observations.
    /// @param oracle The address of the oracle to consult.
    /// @param asset The address of the asset to calculate the variance for.
    /// @param numObservations The number of observations to use.
    /// @param offset The offset to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @param increment The increment to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @param meanType The type of mean to use when performing calculations.
    /// @return The variance of the asset's return rate, expressed as a percentage.
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

    /// @notice Calculates the return rate standard deviation of an asset over a given number of observations.
    /// @param oracle The address of the oracle to consult.
    /// @param asset The address of the asset to calculate the standard deviation for.
    /// @param numObservations The number of observations to use.
    /// @param offset The offset to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @param increment The increment to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @param meanType The type of mean to use when performing calculations.
    /// @return The standard deviation of the asset's return rate, expressed as a percentage.
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

    /// @notice Calculates the average return rate of an asset over a given number of observations.
    /// @param oracle The address of the oracle to consult.
    /// @param asset The address of the asset to calculate the average return rate for.
    /// @param numObservations The number of observations to use.
    /// @param offset The offset to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @param increment The increment to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @param meanType The type of mean to use when performing calculations.
    /// @return The average return rate of the asset, expressed as a percentage.
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

    /// @notice Calculates the return rates of an asset over a given number of observations.
    /// @param oracle The address of the oracle to consult.
    /// @param asset The address of the asset to calculate the return rates for.
    /// @param numObservations The number of observations to use.
    /// @param offset The offset to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @param increment The increment to use when querying the oracle. See IHistoricalOracle#getObservations().
    /// @return The return rates of the asset, expressed as percentages.
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

            // Calculate the difference between the two prices
            int256 difference = latestPrice - price;
            // Calculate the difference between the two prices, expressed as a percentage of the older price
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
