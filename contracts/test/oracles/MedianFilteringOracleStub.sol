// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../oracles/MedianFilteringOracle.sol";

contract MedianFilteringOracleStub is MedianFilteringOracle {
    struct Config {
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool canUpdateOverriden;
        bool canUpdate;
        bool sourceOverridden;
        IHistoricalOracle source;
        bool filterAmountOverridden;
        uint256 filterAmount;
        bool filterOffsetOverridden;
        uint256 filterOffset;
        bool filterIncrementOverridden;
        uint256 filterIncrement;
    }

    Config public config;

    constructor(
        IHistoricalOracle source_,
        uint256 filterAmount_,
        uint256 filterOffset_,
        uint256 filterIncrement_
    ) MedianFilteringOracle(source_, filterAmount_, filterOffset_, filterIncrement_) {}

    function stubPush(
        address token,
        uint112 price,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity,
        uint32 timestamp
    ) public {
        ObservationLibrary.Observation memory observation = ObservationLibrary.Observation({
            price: price,
            tokenLiquidity: tokenLiquidity,
            quoteTokenLiquidity: quoteTokenLiquidity,
            timestamp: timestamp
        });

        push(token, observation);
    }

    function stubPushNow(address token, uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) public {
        stubPush(token, price, tokenLiquidity, quoteTokenLiquidity, uint32(block.timestamp));
    }

    function stubOverrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    function stubOverrideCanUpdate(bool overridden, bool canUpdate_) public {
        config.canUpdateOverriden = overridden;
        config.canUpdate = canUpdate_;
    }

    function stubOverrideSource(bool overridden, IHistoricalOracle source_) public {
        config.sourceOverridden = overridden;
        config.source = source_;
    }

    function stubOverrideFilterAmount(bool overridden, uint256 filterAmount_) public {
        config.filterAmountOverridden = overridden;
        config.filterAmount = filterAmount_;
    }

    function stubOverrideFilterOffset(bool overridden, uint256 filterOffset_) public {
        config.filterOffsetOverridden = overridden;
        config.filterOffset = filterOffset_;
    }

    function stubOverrideFilterIncrement(bool overridden, uint256 filterIncrement_) public {
        config.filterIncrementOverridden = overridden;
        config.filterIncrement = filterIncrement_;
    }

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) {
            return config.needsUpdate;
        }

        return super.needsUpdate(data);
    }

    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.canUpdateOverriden) {
            return config.canUpdate;
        }

        return super.canUpdate(data);
    }

    function _source() internal view virtual override returns (IHistoricalOracle) {
        if (config.sourceOverridden) {
            return config.source;
        }

        return super._source();
    }

    function _filterAmount() internal view virtual override returns (uint256) {
        if (config.filterAmountOverridden) {
            return config.filterAmount;
        }

        return super._filterAmount();
    }

    function _filterOffset() internal view virtual override returns (uint256) {
        if (config.filterOffsetOverridden) {
            return config.filterOffset;
        }

        return super._filterOffset();
    }

    function _filterIncrement() internal view virtual override returns (uint256) {
        if (config.filterIncrementOverridden) {
            return config.filterIncrement;
        }

        return super._filterIncrement();
    }
}
