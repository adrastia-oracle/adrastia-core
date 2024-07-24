// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "./HistoricalAggregatorOracle.sol";
import "./views/VolatilityOracleView.sol";

/**
 * @title PriceVolatilityOracle
 * @notice An oracle that computes and stores the historical volatility of the price of a token, as measured by return
 * rate volatility.
 * @dev The volatility is stored in the price field of the Observation struct.
 */
contract PriceVolatilityOracle is HistoricalAggregatorOracle {
    using SafeCast for uint256;

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

    /// @inheritdoc AbstractOracle
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        IHistoricalOracle sourceOracle = _source();

        // The volatility view needs `amount+1` observations to compute `amount` changes.
        uint256 amount = _observationAmount() + 1;
        uint256 offset = _observationOffset();
        uint256 increment = _observationIncrement();

        if (sourceOracle.getObservationsCount(token) <= (amount - 1) * increment + offset) {
            // If the source oracle doesn't have enough observations, we can't update
            return false;
        }

        // Get the latest observation from the source oracle
        ObservationLibrary.Observation memory sourceObservation = sourceOracle.getObservationAt(token, offset);

        // Get our latest observation
        ObservationLibrary.Observation memory observation = getLatestObservation(token);

        // We need an update if the source has a new observation
        // Note: We must set our observation timestamp as the source's last observation timestamp for this to work
        return sourceObservation.timestamp > observation.timestamp;
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
