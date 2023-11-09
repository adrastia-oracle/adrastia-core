// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "./AbstractOracle.sol";
import "./HistoricalOracle.sol";

/**
 * @title HistoricalAggregatorOracle
 * @notice An oracle that aggregates historical data from another oracle implementing IHistoricalOracle.
 * @dev Override computeObservation to implement the aggregation logic.
 */
abstract contract HistoricalAggregatorOracle is AbstractOracle, HistoricalOracle {
    IHistoricalOracle internal immutable cSource;

    uint256 internal immutable cObservationAmount;
    uint256 internal immutable cObservationOffset;
    uint256 internal immutable cObservationIncrement;

    uint8 internal immutable _priceDecimals;
    uint8 internal immutable _liquidityDecimals;

    error InvalidAmount(uint256 amount);
    error InvalidIncrement(uint256 increment);

    constructor(
        IHistoricalOracle source_,
        uint256 observationAmount_,
        uint256 observationOffset_,
        uint256 observationIncrement_
    ) AbstractOracle(IOracle(address(source_)).quoteTokenAddress()) HistoricalOracle(1) {
        if (observationAmount_ == 0) revert InvalidAmount(observationAmount_);
        if (observationIncrement_ == 0) revert InvalidIncrement(observationIncrement_);

        cSource = source_;
        cObservationAmount = observationAmount_;
        cObservationOffset = observationOffset_;
        cObservationIncrement = observationIncrement_;

        _priceDecimals = IOracle(address(source_)).quoteTokenDecimals();
        _liquidityDecimals = IOracle(address(source_)).liquidityDecimals();
    }

    function source() external view virtual returns (IHistoricalOracle) {
        return _source();
    }

    function observationAmount() external view virtual returns (uint256) {
        return _observationAmount();
    }

    function observationOffset() external view virtual returns (uint256) {
        return _observationOffset();
    }

    function observationIncrement() external view virtual returns (uint256) {
        return _observationIncrement();
    }

    /// @inheritdoc AbstractOracle
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        IHistoricalOracle sourceOracle = _source();

        uint256 amount = _observationAmount();
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

    /// @inheritdoc AbstractOracle
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        return needsUpdate(data);
    }

    /// @inheritdoc AbstractOracle
    function update(bytes memory data) public virtual override returns (bool) {
        if (needsUpdate(data)) return performUpdate(data);

        return false;
    }

    function getLatestObservation(
        address token
    ) public view virtual override returns (ObservationLibrary.Observation memory observation) {
        BufferMetadata storage meta = observationBufferMetadata[token];

        if (meta.size == 0) {
            // If the buffer is empty, return the default observation
            return ObservationLibrary.Observation({price: 0, tokenLiquidity: 0, quoteTokenLiquidity: 0, timestamp: 0});
        }

        return observationBuffers[token][meta.end];
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function quoteTokenName()
        public
        view
        virtual
        override(IQuoteToken, SimpleQuotationMetadata)
        returns (string memory)
    {
        return IOracle(address(_source())).quoteTokenName();
    }

    function quoteTokenSymbol()
        public
        view
        virtual
        override(IQuoteToken, SimpleQuotationMetadata)
        returns (string memory)
    {
        return IOracle(address(_source())).quoteTokenSymbol();
    }

    function quoteTokenDecimals() public view virtual override(IQuoteToken, SimpleQuotationMetadata) returns (uint8) {
        return _priceDecimals;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AbstractOracle) returns (bool) {
        return interfaceId == type(IHistoricalOracle).interfaceId || super.supportsInterface(interfaceId);
    }

    function _source() internal view virtual returns (IHistoricalOracle) {
        return cSource;
    }

    function _observationAmount() internal view virtual returns (uint256) {
        return cObservationAmount;
    }

    function _observationOffset() internal view virtual returns (uint256) {
        return cObservationOffset;
    }

    function _observationIncrement() internal view virtual returns (uint256) {
        return cObservationIncrement;
    }

    function computeObservation(
        address token
    ) internal view virtual returns (ObservationLibrary.Observation memory observation);

    function performUpdate(bytes memory data) internal virtual returns (bool) {
        address token = abi.decode(data, (address));

        ObservationLibrary.Observation memory observation = computeObservation(token);

        push(token, observation);

        return true;
    }

    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        ObservationLibrary.Observation memory observation = computeObservation(token);

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }
}
