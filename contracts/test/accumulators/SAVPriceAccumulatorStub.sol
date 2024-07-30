// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../accumulators/proto/erc4626/SAVPriceAccumulator.sol";

contract SAVPriceAccumulatorStub is SAVPriceAccumulator {
    struct DecimalChange {
        uint8 decimals;
        bool changed;
    }

    DecimalChange public decimalChange;

    constructor(
        IPriceOracle underlyingOracle_,
        IAveragingStrategy averagingStrategy_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        SAVPriceAccumulator(
            underlyingOracle_,
            averagingStrategy_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function quoteTokenDecimals() public view override(IQuoteToken, SimpleQuotationMetadata) returns (uint8) {
        if (decimalChange.changed) {
            return decimalChange.decimals;
        }

        return super.quoteTokenDecimals();
    }

    function stubFetchPrice(address token) public view returns (uint256 price) {
        return super.fetchPrice(abi.encode(token));
    }

    function changeDecimals(uint8 decimals) public {
        decimalChange = DecimalChange(decimals, true);
    }
}

contract SAVPriceAccumulatorUpdater {
    SAVPriceAccumulator public accumulator;

    constructor(SAVPriceAccumulator accumulator_) {
        accumulator = accumulator_;
    }

    function update(address token) external {
        accumulator.update(abi.encode(token));
    }
}
