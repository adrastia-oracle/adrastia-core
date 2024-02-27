//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IDIAOracleV2} from "../oracles/views/DiaOracleView.sol";

contract DiaFeedStub is IDIAOracleV2 {
    struct Price {
        uint128 value;
        uint128 timestamp;
    }

    mapping(bytes32 => Price) public prices;

    uint8 public decimals;
    bytes32 public defaultId;

    constructor(bytes32 _defaultId, uint8 _decimals) {
        defaultId = _defaultId;
        decimals = _decimals;
    }

    function setPrice(bytes32 id, uint128 price, uint128 timestamp) public {
        prices[id] = Price(price, timestamp);
    }

    function setRoundDataNow(uint128 price) public {
        setPrice(defaultId, price, uint128(block.timestamp));
    }

    function setRoundData(uint80, uint128 answer_, uint256, uint128 updatedAt_, uint80) public {
        setPrice(defaultId, answer_, updatedAt_);
    }

    function stringToBytes32(string memory source) public pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        // Truncating if the string is longer than 32 bytes or padding with 0s
        assembly {
            result := mload(add(source, 32))
        }
    }

    function getValue(string memory feedId) external view override returns (uint128 value, uint128 timestamp) {
        bytes32 id = stringToBytes32(feedId);

        Price memory price = prices[id];

        return (price.value, price.timestamp);
    }
}
