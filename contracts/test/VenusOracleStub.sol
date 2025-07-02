//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {OracleInterface} from "../oracles/views/VenusOracleView.sol";

contract VenusOracleStub is OracleInterface {
    uint8 public decimals;

    mapping(address => bool) public hasPrice;
    mapping(address => uint256) public prices;

    address internal immutable defaultFeedToken;

    constructor(address feedToken_, uint8 _decimals) {
        defaultFeedToken = feedToken_;
        decimals = _decimals;
    }

    function setPrice(address token, uint256 price) public {
        // Convert the price to the Venus format (decimals = 36 - tokenDecimals)

        uint256 tokenDecimals = getTokenDecimals(token);

        uint256 venusDecimals = 36 - tokenDecimals;

        if (venusDecimals > decimals) {
            // Increase the price to match the expected decimals
            price = price * (10 ** (venusDecimals - decimals));
        } else if (venusDecimals < decimals) {
            // Decrease the price to match the expected decimals
            price = price / (10 ** (decimals - venusDecimals));
        }

        prices[token] = price;
        hasPrice[token] = true;
    }

    function setRoundDataNow(uint256 price) public {
        // Set the price for the default feed token
        setPrice(defaultFeedToken, price);
    }

    function setRoundData(uint80, uint256 answer_, uint256, uint256, uint80) public {
        // Set the price for the default feed token
        setPrice(defaultFeedToken, answer_);
    }

    function getPrice(address asset) external view override returns (uint256) {
        if (!hasPrice[asset]) {
            revert("UnsupportedToken");
        }

        return prices[asset];
    }

    /**
     * @notice Gets the number of decimals for a token.
     * @dev Defaults to 18 decimals if the token does not implement the `decimals()` function or if the call fails.
     *
     * @param token The address of the token to get the decimals for. Use 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB
     * for native BNB.
     */
    function getTokenDecimals(address token) internal view virtual returns (uint8) {
        if (token == 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB) {
            return 18; // Native token (BNB - 18 decimals)
        }

        (bool success, bytes memory data) = address(token).staticcall(abi.encodeWithSignature("decimals()"));
        if (!success || data.length != 32) {
            return 18; // Assume 18
        }

        return abi.decode(data, (uint8));
    }
}
