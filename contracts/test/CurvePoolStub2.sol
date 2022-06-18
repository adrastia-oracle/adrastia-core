//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title ICurvePool
/// @notice A simple interface for accessing various Curve pool functions.
interface ICurvePool {
    /**
     * @notice Gets the current price of `dx` tokens, less the admin fees.
     * @param i The index value for the coin to get the price for.
     * @param j The index value for the coin for which the price is denominated in.
     * @param dx The number of coins with index `i` to calculate the price of.
     * @return The price.
     */
    function get_dy(
        uint256 i,
        uint256 j,
        uint256 dx
    ) external view returns (uint256);

    /**
     * @notice Gets the address of one of the coins in the pool.
     * @param index The index value for the coin.
     * @return The address of the coin at index `index`.
     */
    function coins(uint256 index) external view returns (address);

    /**
     * @notice Get the current balance of a coin within the pool, less the accrued admin fees.
     * @param index The index value for the coin to query balance of.
     * @return The token balance.
     */
    function balances(uint256 index) external view returns (uint256);
}

/// @notice Uses the same get_dy function as Tricrypto2.
contract CurvePoolStub2 is ICurvePool {
    address[] public override coins;

    mapping(address => uint256) public vBalances;

    mapping(address => mapping(address => uint256)) rates;

    constructor(address[] memory coins_) {
        coins = coins_;
    }

    function get_dy(
        uint256 i,
        uint256 j,
        uint256 dx
    ) external view returns (uint256) {
        address token = coins[i];
        address quoteToken = coins[j];

        uint256 wholeTokenAmount = 10**(IERC20Metadata(token).decimals());

        require(dx == wholeTokenAmount, "CurvePoolStub: WRONG_AMOUNT");

        return rates[token][quoteToken];
    }

    function balances(uint256 index) external view returns (uint256) {
        return vBalances[coins[index]];
    }

    function stubSetRate(
        address token,
        address quoteToken,
        uint256 rate
    ) external {
        rates[token][quoteToken] = rate;
    }

    function stubSetBalance(address coin, uint256 balance) external {
        vBalances[coin] = balance;
    }
}
