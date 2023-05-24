// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "./AbstractOracle.sol";
import "./HistoricalOracle.sol";
import "../libraries/SortingLibrary.sol";

contract MedianFilteringOracle is AbstractOracle, HistoricalOracle {
    using SortingLibrary for uint112[];

    IHistoricalOracle internal immutable cSource;

    uint256 internal immutable cFilterAmount;
    uint256 internal immutable cFilterOffset;
    uint256 internal immutable cFilterIncrement;

    uint8 internal immutable _priceDecimals;
    uint8 internal immutable _liquidityDecimals;

    error InvalidAmount(uint256 amount);
    error InvalidIncrement(uint256 increment);

    constructor(
        IHistoricalOracle source_,
        uint256 filterAmount_,
        uint256 filterOffset_,
        uint256 filterIncrement_
    ) AbstractOracle(IOracle(address(source_)).quoteTokenAddress()) HistoricalOracle(1) {
        if (filterAmount_ == 0) revert InvalidAmount(filterAmount_);
        if (filterIncrement_ == 0) revert InvalidIncrement(filterIncrement_);

        cSource = source_;
        cFilterAmount = filterAmount_;
        cFilterOffset = filterOffset_;
        cFilterIncrement = filterIncrement_;

        _priceDecimals = IOracle(address(source_)).quoteTokenDecimals();
        _liquidityDecimals = IOracle(address(source_)).liquidityDecimals();
    }

    function source() external view virtual returns (IHistoricalOracle) {
        return _source();
    }

    function filterAmount() external view virtual returns (uint256) {
        return _filterAmount();
    }

    function filterOffset() external view virtual returns (uint256) {
        return _filterOffset();
    }

    function filterIncrement() external view virtual returns (uint256) {
        return _filterIncrement();
    }

    /// @inheritdoc AbstractOracle
    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        IHistoricalOracle sourceOracle = _source();

        uint256 amount = _filterAmount();
        uint256 offset = _filterOffset();
        uint256 increment = _filterIncrement();

        if (sourceOracle.getObservationsCount(token) <= (amount - 1) * increment + offset) {
            // If the source oracle doesn't have enough observations, we can't update
            return false;
        }

        // Get the latest observation from the source oracle
        ObservationLibrary.Observation memory sourceObservation = sourceOracle.getObservationAt(token, 0);

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

    function _filterAmount() internal view virtual returns (uint256) {
        return cFilterAmount;
    }

    function _filterOffset() internal view virtual returns (uint256) {
        return cFilterOffset;
    }

    function _filterIncrement() internal view virtual returns (uint256) {
        return cFilterIncrement;
    }

    function computeMedianObservation(
        address token
    ) internal view virtual returns (ObservationLibrary.Observation memory observation) {
        uint256 len = _filterAmount();

        IHistoricalOracle sourceOracle = _source();

        // Get the required number of observations from the source oracle
        ObservationLibrary.Observation[] memory observations = sourceOracle.getObservations(
            token,
            len,
            _filterOffset(),
            _filterIncrement()
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

    function performUpdate(bytes memory data) internal virtual returns (bool) {
        address token = abi.decode(data, (address));

        ObservationLibrary.Observation memory observation = computeMedianObservation(token);

        push(token, observation);

        return true;
    }

    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        ObservationLibrary.Observation memory observation = computeMedianObservation(token);

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }
}
