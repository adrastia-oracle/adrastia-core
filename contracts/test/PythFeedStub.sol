//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IPyth} from "../oracles/views/PythOracleView.sol";

contract PythFeedStub is IPyth {
    mapping(bytes32 => Price) public prices;

    uint8 public decimals;
    bytes32 public defaultId;

    constructor(bytes32 _defaultId, uint8 _decimals) {
        defaultId = _defaultId;
        decimals = _decimals;
    }

    function setPrice(bytes32 id, int64 price, uint64 conf, int32 expo, uint256 publishTime) public {
        prices[id] = Price(price, conf, expo, publishTime);
    }

    function setRoundDataNow(int64 price) public {
        setPrice(defaultId, int64(price), 0, int32(uint32(decimals)) * -1, block.timestamp);
    }

    function setRoundData(uint80, int64 answer_, uint256, uint256 updatedAt_, uint80) public {
        setPrice(defaultId, int64(answer_), 0, int32(uint32(decimals)) * -1, updatedAt_);
    }

    function getPriceUnsafe(bytes32 id) external view override returns (Price memory price) {
        return prices[id];
    }
}
