// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../LiquidityAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

interface IVault {
    function getPoolTokens(
        bytes32 poolId
    ) external view returns (address[] memory tokens, uint256[] memory balances, uint256 lastChangeBlock);

    function getPool(bytes32 poolId) external view returns (address poolAddress, uint8 numTokens);
}

contract BalancerV2LiquidityAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    address public immutable balancerVault;
    address public immutable poolAddress;
    bytes32 public immutable poolId;
    uint256 public immutable quoteTokenIndex;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;
    uint256 internal immutable _quoteTokenWholeUnit;

    error TokenNotFound(address token);

    constructor(
        IAveragingStrategy averagingStrategy_,
        address balancerVault_,
        bytes32 poolId_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        balancerVault = balancerVault_;
        (poolAddress, ) = IVault(balancerVault_).getPool(poolId_);
        poolId = poolId_;

        // Get the quote token index
        (address[] memory tokens, , ) = IVault(balancerVault_).getPoolTokens(poolId_);
        uint256 _quoteTokenIndex = findTokenIndex(tokens, quoteToken_);
        if (_quoteTokenIndex == type(uint256).max) {
            revert TokenNotFound(quoteToken_);
        }

        quoteTokenIndex = _quoteTokenIndex;
        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;
        _quoteTokenWholeUnit = 10 ** super.quoteTokenDecimals();
    }

    /// @inheritdoc LiquidityAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        if (token == address(0) || token == quoteToken) {
            // Invalid token
            return false;
        }

        (address[] memory tokens, , ) = IVault(balancerVault).getPoolTokens(poolId);
        uint256 tokenIndex = findTokenIndex(tokens, token);
        if (tokenIndex == type(uint256).max) {
            // The pool doesn't contain the token
            return false;
        }

        return super.canUpdate(data);
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function findTokenIndex(address[] memory tokens, address token) internal pure returns (uint256) {
        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; ++i) {
            if (tokens[i] == token) {
                return i;
            }
        }

        return type(uint256).max;
    }

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));

        // Get the pool tokens and balances
        (address[] memory tokens, uint256[] memory balances, ) = IVault(balancerVault).getPoolTokens(poolId);

        // Get the token index
        uint256 tokenIndex = findTokenIndex(tokens, token);
        if (tokenIndex == type(uint256).max) {
            // The pool doesn't contain the token
            revert TokenNotFound(token);
        }

        // Get the token balance
        uint256 tokenBalance = balances[tokenIndex];
        uint256 quoteTokenBalance = balances[quoteTokenIndex];

        tokenLiquidity = ((tokenBalance * _decimalFactor) / 10 ** IERC20Metadata(token).decimals()).toUint112();
        quoteTokenLiquidity = ((quoteTokenBalance * _decimalFactor) / _quoteTokenWholeUnit).toUint112();
    }
}
