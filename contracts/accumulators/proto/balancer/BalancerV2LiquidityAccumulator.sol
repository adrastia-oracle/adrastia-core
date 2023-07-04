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

interface IBasePool {
    function getPoolId() external view returns (bytes32);

    function inRecoveryMode() external view returns (bool);
}

interface ILinearPool {
    function getMainIndex() external view returns (uint256);

    function getMainToken() external view returns (address);
}

contract BalancerV2LiquidityAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    address public immutable balancerVault;
    address public immutable poolAddress;
    bytes32 public immutable poolId;

    uint256 internal immutable quoteTokenIndex;
    uint256 internal immutable quoteTokenSubIndex;
    bool internal immutable quoteTokenIsWrapped;
    bytes32 internal immutable quoteTokenWrapperPoolId;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;
    uint256 internal immutable _quoteTokenWholeUnit;

    error TokenNotFound(address token);

    error PoolInRecoveryMode(address pool);

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
        (bool containsToken, uint256 index, bool isInsideLinearPool, uint256 linearPoolIndex) = findTokenIndex(
            tokens,
            quoteToken_
        );
        if (!containsToken) {
            revert TokenNotFound(quoteToken_);
        }

        quoteTokenIndex = index;
        quoteTokenSubIndex = linearPoolIndex;
        quoteTokenIsWrapped = isInsideLinearPool;

        // Resolve the quote token wrapper pool ID (if it has one)
        bytes32 quoteTokenWrapperPoolId_;
        if (quoteTokenIsWrapped) quoteTokenWrapperPoolId_ = IBasePool(tokens[index]).getPoolId();
        quoteTokenWrapperPoolId = quoteTokenWrapperPoolId_;

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

        if (inRecoveryMode(poolAddress)) {
            // The pool is in recovery mode
            return false;
        }

        (address[] memory tokens, , ) = IVault(balancerVault).getPoolTokens(poolId);
        (bool containsToken, uint256 tokenIndex, bool tokenIsWrapped, ) = findTokenIndex(tokens, token);
        if (!containsToken) {
            // The pool doesn't contain the token
            return false;
        }

        if (quoteTokenIsWrapped) {
            // Check if the quote token linear pool is in recovery mode
            if (inRecoveryMode(tokens[quoteTokenIndex])) {
                // The quote token linear pool is in recovery mode
                return false;
            }
        }

        if (tokenIsWrapped) {
            // Check if the token linear pool is in recovery mode
            if (inRecoveryMode(tokens[tokenIndex])) {
                // The token linear pool is in recovery mode
                return false;
            }
        }

        return super.canUpdate(data);
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function inRecoveryMode(address pool) internal view virtual returns (bool) {
        (bool success, bytes memory data) = pool.staticcall(abi.encodeWithSelector(IBasePool.inRecoveryMode.selector));
        if (success && data.length == 32) {
            return abi.decode(data, (bool));
        }

        return false; // Doesn't implement the function
    }

    function findTokenIndex(
        address[] memory tokens,
        address token
    ) internal view virtual returns (bool, uint256, bool, uint256) {
        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; ++i) {
            if (tokens[i] == token) {
                return (true, i, false, 0);
            }

            // Check if tokens[i] is a linear pool with the token as the main token
            (bool success, bytes memory data) = tokens[i].staticcall(
                abi.encodeWithSelector(ILinearPool.getMainToken.selector)
            );
            if (success && data.length == 32) {
                address mainToken = abi.decode(data, (address));
                if (mainToken == token) {
                    // Get the main token index
                    uint256 mainTokenIndex = ILinearPool(tokens[i]).getMainIndex();
                    return (true, i, true, mainTokenIndex);
                }
            }
        }

        return (false, 0, false, 0);
    }

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        // Ensure that the pool is not in recovery mode
        if (inRecoveryMode(poolAddress)) {
            revert PoolInRecoveryMode(poolAddress);
        }

        address token = abi.decode(data, (address));

        // Get the pool tokens and balances
        (address[] memory tokens, uint256[] memory balances, ) = IVault(balancerVault).getPoolTokens(poolId);

        // Get the token index
        (bool hasToken, uint256 tokenIndex, bool tokenIsWrapped, uint256 tokenSubIndex) = findTokenIndex(tokens, token);
        if (!hasToken) {
            // The pool doesn't contain the token
            revert TokenNotFound(token);
        }

        // Get the token balance
        uint256 tokenBalance = balances[tokenIndex];
        uint256 quoteTokenBalance = balances[quoteTokenIndex];

        if (tokenIsWrapped) {
            // Token balance is for the wrapped token, get the balance of the underlying token

            // Ensure that the token linear pool is not in recovery mode
            if (inRecoveryMode(tokens[tokenIndex])) {
                revert PoolInRecoveryMode(tokens[tokenIndex]);
            }

            // Get the token wrapper pool ID
            bytes32 tokenWrapperPoolId = IBasePool(tokens[tokenIndex]).getPoolId();

            // Get the balances of the wrapper pool
            (, uint256[] memory wrapperBalances, ) = IVault(balancerVault).getPoolTokens(tokenWrapperPoolId);
            // Get the underlying token balance
            tokenBalance = wrapperBalances[tokenSubIndex];
            // Note: We purposely ignore the wrapped token balance and only use the main token balance
            // This is to help the aggregator filter out innaccurate prices in the case where the underlying protocol
            // has a bug that causes users to sell the wrapped token for the main token at a price that is not
            // representative of the actual price of the main token.
            // In such cases, the balance of the main token will approach 0, while the balance of the wrapped token
            // will approach infinity.
        }

        if (quoteTokenIsWrapped) {
            // Token balance is for the wrapped token, get the balance of the underlying token

            // Ensure that the quote token linear pool is not in recovery mode
            if (inRecoveryMode(tokens[quoteTokenIndex])) {
                revert PoolInRecoveryMode(tokens[quoteTokenIndex]);
            }

            // Get the balances of the wrapper pool
            (, uint256[] memory wrapperBalances, ) = IVault(balancerVault).getPoolTokens(quoteTokenWrapperPoolId);
            // Get the underlying token balance
            quoteTokenBalance = wrapperBalances[quoteTokenSubIndex];
            // Note: The note above applies here as well.
        }

        tokenLiquidity = ((tokenBalance * _decimalFactor) / 10 ** IERC20Metadata(token).decimals()).toUint112();
        quoteTokenLiquidity = ((quoteTokenBalance * _decimalFactor) / _quoteTokenWholeUnit).toUint112();
    }
}
