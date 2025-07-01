// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";
import "../../../libraries/balancer-v2/StableMath.sol";
import "../../../libraries/balancer-v2/FixedPoint.sol";

interface IVault {
    function getPoolTokens(
        bytes32 poolId
    ) external view returns (address[] memory tokens, uint256[] memory balances, uint256 lastChangeBlock);

    function getPool(bytes32 poolId) external view returns (address poolAddress, uint8 numTokens);
}

interface IStablePool {
    function getAmplificationParameter() external view returns (uint256 amp, bool isUpdating);

    /// @dev This isn't implemented by MetaStablePool, but it is implemented by ComposableStablePool
    function getBptIndex() external view returns (uint256);
}

interface IBasePool {
    /**
     * @dev Returns the current swap fee percentage as a 18 decimal fixed point number, so e.g. 1e17 corresponds to a
     * 10% swap fee.
     */
    function getSwapFeePercentage() external view returns (uint256);

    /**
     * @dev Returns the scaling factors of each of the Pool's tokens. This is an implementation detail that is typically
     * not relevant for outside parties, but which might be useful for some types of Pools.
     */
    function getScalingFactors() external view returns (uint256[] memory);

    function getPausedState()
        external
        view
        returns (bool paused, uint256 pauseWindowEndTime, uint256 bufferPeriodEndTime);

    function paused() external view returns (bool);
}

interface ILinearPool {
    function getMainIndex() external view returns (uint256);

    function getMainToken() external view returns (address);

    function getRate() external view returns (uint256);
}

contract BalancerV2StablePriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCast for uint256;
    using FixedPoint for uint256;

    address public immutable balancerVault;
    address public immutable poolAddress;
    bytes32 public immutable poolId;

    uint256 internal immutable quoteTokenIndex;
    uint256 internal immutable quoteTokenSubIndex;
    bool internal immutable quoteTokenIsWrapped;

    bool internal immutable hasBpt;
    uint256 internal immutable bptIndex;

    error TokenNotFound(address token);

    error PoolIsPaused(address pool);
    error AmplificationParameterUpdating();

    constructor(
        IAveragingStrategy averagingStrategy_,
        address balancerVault_,
        bytes32 poolId_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
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

        bool _hasBpt = false;
        uint256 _bptIndex = 0;

        (bool success, bytes memory bptIndexData) = poolAddress.staticcall(
            abi.encodeWithSelector(IStablePool.getBptIndex.selector)
        );
        if (success && bptIndexData.length == 32) {
            _hasBpt = true;
            _bptIndex = abi.decode(bptIndexData, (uint256));
        }

        hasBpt = _hasBpt;
        bptIndex = _bptIndex;
    }

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        if (token == address(0) || token == quoteToken) {
            // Invalid token
            return false;
        }

        if (isPaused(poolAddress)) {
            // The pool is in recovery mode
            return false;
        }

        (address[] memory tokens, uint256[] memory balances, ) = IVault(balancerVault).getPoolTokens(poolId);
        (bool containsToken, uint256 tokenIndex, bool tokenIsWrapped, ) = findTokenIndex(tokens, token);
        if (!containsToken) {
            // The pool doesn't contain the token
            return false;
        }

        if (quoteTokenIsWrapped) {
            // Check if the quote token linear pool is in recovery mode
            if (isPaused(tokens[quoteTokenIndex])) {
                // The quote token linear pool is in recovery mode
                return false;
            }
        }

        if (tokenIsWrapped) {
            // Check if the token linear pool is in recovery mode
            if (isPaused(tokens[tokenIndex])) {
                // The token linear pool is in recovery mode
                return false;
            }
        }

        // Return false if any of the balances are zero
        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; ++i) {
            if (balances[i] == 0) {
                return false;
            }
        }

        return super.canUpdate(data);
    }

    function isPaused(address pool) internal view virtual returns (bool) {
        (bool success, bytes memory data) = pool.staticcall(abi.encodeWithSelector(IBasePool.getPausedState.selector));
        if (success && data.length == 96) {
            (bool paused, , ) = abi.decode(data, (bool, uint256, uint256));

            return paused;
        }

        (success, data) = pool.staticcall(abi.encodeWithSelector(IBasePool.paused.selector));
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

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112) {
        return fetchPrice(data, 0 /* not used - save on gas */);
    }

    /**
     * @notice Calculates the price of a token.
     * @dev When the price equals 0, a price of 1 is actually returned.
     * @param data The address of the token to calculate the price of, encoded as bytes.
     * @return price The price of the specified token in terms of the quote token, scaled by the quote token decimal
     *   places.
     */
    function fetchPrice(
        bytes memory data,
        uint256 /* maxAge */
    ) internal view virtual override returns (uint112 price) {
        // Ensure that the pool is not in recovery mode
        if (isPaused(poolAddress)) {
            revert PoolIsPaused(poolAddress);
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

        (uint256 amp, ) = IStablePool(poolAddress).getAmplificationParameter();
        uint256[] memory scalingFactors = IBasePool(poolAddress).getScalingFactors();

        uint256 amount = computeWholeUnitAmount(token);
        if (tokenIsWrapped) {
            // The token is inside a linear pool, so we need to convert the amount of the token to the amount of BPT

            // Ensure that the token linear pool is not in recovery mode
            if (isPaused(tokens[tokenIndex])) {
                revert PoolIsPaused(tokens[tokenIndex]);
            }

            ILinearPool linearPool = ILinearPool(tokens[tokenIndex]);
            uint256[] memory linearPoolScalingFactors = IBasePool(tokens[tokenIndex]).getScalingFactors();
            amount = (amount * linearPoolScalingFactors[tokenSubIndex]) / linearPool.getRate();
        }

        // Fees are subtracted before scaling, to reduce the complexity of the rounding direction analysis.
        amount -= amount.mulUp(IBasePool(poolAddress).getSwapFeePercentage());

        // Scale the amount and balances
        _upscaleArray(balances, scalingFactors, balances.length);
        amount = _upscale(amount, scalingFactors[tokenIndex]);

        uint256 _quoteTokenIndex = quoteTokenIndex;

        // Filter out the BPT if the pool contains it
        if (hasBpt) {
            uint256 _bptIndex = bptIndex;
            // Remove the BPT from the balances
            uint256[] memory newBalances = new uint256[](balances.length - 1);
            for (uint256 i = 0; i < balances.length; ++i) {
                if (i != _bptIndex) {
                    newBalances[i < _bptIndex ? i : i - 1] = balances[i];
                }
            }
            balances = newBalances;

            // Re-index the token indices if they were shifted by the removal of the BPT
            if (tokenIndex > _bptIndex) --tokenIndex;
            if (_quoteTokenIndex > _bptIndex) --_quoteTokenIndex;
        }

        uint256 invariant = StableMath._calculateInvariant(amp, balances);
        uint256 amountOut = StableMath._calcOutGivenIn(amp, balances, tokenIndex, _quoteTokenIndex, amount, invariant);

        amountOut = _downscaleDown(amountOut, scalingFactors[quoteTokenIndex]);

        if (quoteTokenIsWrapped) {
            // The quote token is inside a linear pool, so we need to convert the amount of BPT to the amount of the
            // quote token

            // Ensure that the quote token linear pool is not in recovery mode
            if (isPaused(tokens[quoteTokenIndex])) {
                revert PoolIsPaused(tokens[quoteTokenIndex]);
            }

            ILinearPool linearPool = ILinearPool(tokens[quoteTokenIndex]);
            uint256[] memory linearPoolScalingFactors = IBasePool(tokens[quoteTokenIndex]).getScalingFactors();
            amountOut = (amountOut * linearPool.getRate()) / linearPoolScalingFactors[quoteTokenSubIndex];
        }

        price = amountOut.toUint112();

        if (price == 0) return 1;
    }

    function computeWholeUnitAmount(address token) internal view virtual returns (uint256 amount) {
        amount = uint256(10) ** IERC20Metadata(token).decimals();
    }

    /**
     * @dev Reverses the `scalingFactor` applied to `amount`, resulting in a smaller or equal value depending on
     * whether it needed scaling or not. The result is rounded down.
     */
    function _downscaleDown(uint256 amount, uint256 scalingFactor) internal pure virtual returns (uint256) {
        return FixedPoint.divDown(amount, scalingFactor);
    }

    /**
     * @dev Applies `scalingFactor` to `amount`, resulting in a larger or equal value depending on whether it needed
     * scaling or not.
     */
    function _upscale(uint256 amount, uint256 scalingFactor) internal pure virtual returns (uint256) {
        // Upscale rounding wouldn't necessarily always go in the same direction: in a swap for example the balance of
        // token in should be rounded up, and that of token out rounded down. This is the only place where we round in
        // the same direction for all amounts, as the impact of this rounding is expected to be minimal (and there's no
        // rounding error unless `_scalingFactor()` is overriden).
        return FixedPoint.mulDown(amount, scalingFactor);
    }

    /**
     * @dev Same as `_upscale`, but for an entire array. This function does not return anything, but instead *mutates*
     * the `amounts` array.
     */
    function _upscaleArray(
        uint256[] memory amounts,
        uint256[] memory scalingFactors,
        uint256 numTokens
    ) internal pure virtual {
        for (uint256 i = 0; i < numTokens; ++i) {
            amounts[i] = FixedPoint.mulDown(amounts[i], scalingFactors[i]);
        }
    }
}
