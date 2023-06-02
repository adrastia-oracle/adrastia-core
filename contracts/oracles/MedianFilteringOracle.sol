// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./HistoricalAggregatorOracle.sol";
import "../libraries/SortingLibrary.sol";

contract MedianFilteringOracle is HistoricalAggregatorOracle {
    using SortingLibrary for uint112[];

    constructor(
        IHistoricalOracle source_,
        uint256 filterAmount_,
        uint256 filterOffset_,
        uint256 filterIncrement_
    ) HistoricalAggregatorOracle(source_, filterAmount_, filterOffset_, filterIncrement_) {}

    function computeObservation(
        address token
    ) internal view virtual override returns (ObservationLibrary.Observation memory observation) {
        uint256 len = _observationAmount();

        IHistoricalOracle sourceOracle = _source();

        // Get the required number of observations from the source oracle
        ObservationLibrary.Observation[] memory observations = sourceOracle.getObservations(
            token,
            len,
            _observationOffset(),
            _observationIncrement()
        );
        if (len == 1) return observations[0];

        // Extract all prices and liquidities from the observations
        uint112[] memory prices = new uint112[](len);
        uint112[] memory tokenLiquidities = new uint112[](len);
        uint112[] memory quoteTokenLiquidities = new uint112[](len);
        for (uint256 i = 0; i < len; ++i) {
            prices[i] = observations[i].price;
            tokenLiquidities[i] = observations[i].tokenLiquidity;
            quoteTokenLiquidities[i] = observations[i].quoteTokenLiquidity;
        }

        // Sort the prices and liquidities
        prices.quickSort(0, int256(prices.length - 1));
        tokenLiquidities.quickSort(0, int256(tokenLiquidities.length - 1));
        quoteTokenLiquidities.quickSort(0, int256(quoteTokenLiquidities.length - 1));

        uint256 medianIndex = len / 2;

        if (len % 2 == 0) {
            // If the number of observations is even, take the average of the two middle values

            // Casting to uint112 because the average of two uint112s cannot overflow a uint112
            observation.price = uint112((uint256(prices[medianIndex - 1]) + uint256(prices[medianIndex])) / 2);
            observation.tokenLiquidity = uint112(
                (uint256(tokenLiquidities[medianIndex - 1]) + uint256(tokenLiquidities[medianIndex])) / 2
            );
            observation.quoteTokenLiquidity = uint112(
                (uint256(quoteTokenLiquidities[medianIndex - 1]) + uint256(quoteTokenLiquidities[medianIndex])) / 2
            );
        } else {
            // If the number of observations is odd, take the middle value
            observation.price = prices[medianIndex];
            observation.tokenLiquidity = tokenLiquidities[medianIndex];
            observation.quoteTokenLiquidity = quoteTokenLiquidities[medianIndex];
        }

        // Set the observation timestamp to the source's latest observation timestamp
        observation.timestamp = observations[0].timestamp;
    }
}
