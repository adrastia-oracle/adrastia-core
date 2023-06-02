// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./HistoricalAggregatorOracle.sol";
import "./views/VolatilityOracleView.sol";
import "../libraries/SafeCastExt.sol";

/**
 * @title PriceVolatilityOracle
 * @notice An oracle that computes and stores the historical volatility of the price of a token, as measured by return
 * rate volatility.
 * @dev The volatility is stored in the price field of the Observation struct.
 */
contract PriceVolatilityOracle is HistoricalAggregatorOracle {
    using SafeCastExt for uint256;

    VolatilityOracleView internal immutable cView;

    uint256 internal immutable cMeanType;

    error InvalidVolatilityView(address volatilityView);

    constructor(
        VolatilityOracleView view_,
        IHistoricalOracle source_,
        uint256 observationAmount_,
        uint256 observationOffset_,
        uint256 observationIncrement_,
        uint256 meanType_
    ) HistoricalAggregatorOracle(source_, observationAmount_, observationOffset_, observationIncrement_) {
        if (address(view_) == address(0)) revert InvalidVolatilityView(address(view_));

        cView = view_;
        cMeanType = meanType_;
    }

    function volatilityView() external view virtual returns (VolatilityOracleView) {
        return _volatilityView();
    }

    function meanType() external view virtual returns (uint256) {
        return _meanType();
    }

    function _volatilityView() internal view virtual returns (VolatilityOracleView) {
        return cView;
    }

    function _meanType() internal view virtual returns (uint256) {
        return cMeanType;
    }

    function computeObservation(
        address token
    ) internal view virtual override returns (ObservationLibrary.Observation memory observation) {
        IHistoricalOracle sourceOracle = _source();
        VolatilityOracleView volView = _volatilityView();
        uint256 amount = _observationAmount();
        uint256 offset = _observationOffset();
        uint256 increment = _observationIncrement();
        uint256 mType = _meanType();

        // Compute the volatility
        uint256 volatility = volView.priceChangeVolatility(sourceOracle, token, amount, offset, increment, mType);

        // Get the most recent observation that's used for calculating the volatility
        ObservationLibrary.Observation memory sourceObservation = sourceOracle.getObservationAt(token, offset);

        observation.price = volatility.toUint112();
        observation.tokenLiquidity = 0;
        observation.quoteTokenLiquidity = 0;
        observation.timestamp = sourceObservation.timestamp;
    }
}
