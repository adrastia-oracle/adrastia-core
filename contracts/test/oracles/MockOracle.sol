// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../oracles/AbstractOracle.sol";

contract MockOracle is AbstractOracle {
    struct PriceDecimalChange {
        uint8 decimals;
        bool changed;
    }

    PriceDecimalChange public priceDecimalChange;

    mapping(bytes32 => uint256) public callCounts;

    bool _needsUpdate;
    bool _updateReturn;

    bool _consultError;
    bool _updateError;
    bool _updateErrorWithReason;

    uint8 _liquidityDecimals;

    mapping(address => ObservationLibrary.Observation) public observations;

    mapping(address => ObservationLibrary.Observation) instantRates;

    constructor(address quoteToken_) AbstractOracle(quoteToken_) {
        _liquidityDecimals = 0;
    }

    function quoteTokenDecimals() public view virtual override(IQuoteToken, SimpleQuotationMetadata) returns (uint8) {
        if (priceDecimalChange.changed) {
            return priceDecimalChange.decimals;
        }

        return super.quoteTokenDecimals();
    }

    function getLatestObservation(
        address token
    ) public view virtual override returns (ObservationLibrary.Observation memory observation) {
        return observations[token];
    }

    function stubSetObservation(
        address token,
        uint112 price,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity,
        uint32 timestamp
    ) public {
        ObservationLibrary.Observation storage observation = observations[token];

        observation.price = price;
        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
        observation.timestamp = timestamp;
    }

    function stubSetInstantRates(
        address token,
        uint112 price,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) public {
        ObservationLibrary.Observation storage observation = instantRates[token];

        observation.price = price;
        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
    }

    function stubSetNeedsUpdate(bool b) public {
        _needsUpdate = b;
    }

    function stubSetUpdateReturn(bool b) public {
        _updateReturn = b;
    }

    function stubSetConsultError(bool b) public {
        _consultError = b;
    }

    function stubSetUpdateError(bool b) public {
        _updateError = b;
    }

    function stubSetUpdateErrorWithReason(bool b) public {
        _updateErrorWithReason = b;
    }

    function stubSetLiquidityDecimals(uint8 decimals) public {
        _liquidityDecimals = decimals;
    }

    function stubSetPriceDecimals(uint8 decimals) public {
        priceDecimalChange = PriceDecimalChange(decimals, true);
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function consult(
        address token
    ) public view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        if (_consultError) price = 2 * type(uint112).max;

        return super.consult(token);
    }

    function consult(
        address token,
        uint256 maxAge
    ) public view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        if (_consultError) price = 2 * type(uint112).max;

        return super.consult(token, maxAge);
    }

    function update(bytes memory /*data*/) public virtual override returns (bool) {
        callCounts["update(address)"]++;

        if (_updateError) return 2 * type(uint256).max == 0;

        require(!_updateErrorWithReason, "REASON");

        return _updateReturn;
    }

    function needsUpdate(bytes memory /*data*/) public view virtual override returns (bool) {
        return _needsUpdate;
    }

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        return needsUpdate(data);
    }

    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        ObservationLibrary.Observation storage observation = instantRates[token];

        price = observation.price;
        tokenLiquidity = observation.tokenLiquidity;
        quoteTokenLiquidity = observation.quoteTokenLiquidity;
    }
}
