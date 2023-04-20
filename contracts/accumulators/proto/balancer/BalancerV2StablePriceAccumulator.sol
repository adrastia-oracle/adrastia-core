// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";
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
}

contract BalancerV2StablePriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;
    using FixedPoint for uint256;

    address public immutable balancerVault;
    address public immutable poolAddress;
    bytes32 public immutable poolId;
    uint256 public immutable quoteTokenIndex;

    error TokenNotFound(address token);

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
        uint256 _quoteTokenIndex = findTokenIndex(tokens, quoteToken_);
        if (_quoteTokenIndex == type(uint256).max) {
            revert TokenNotFound(quoteToken_);
        }

        quoteTokenIndex = _quoteTokenIndex;
    }

    /// @inheritdoc PriceAccumulator
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

    function findTokenIndex(address[] memory tokens, address token) internal pure returns (uint256) {
        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; ++i) {
            if (tokens[i] == token) {
                return i;
            }
        }

        return type(uint256).max;
    }

    /**
     * @notice Calculates the price of a token.
     * @dev When the price equals 0, a price of 1 is actually returned.
     * @param data The address of the token to calculate the price of, encoded as bytes.
     * @return price The price of the specified token in terms of the quote token, scaled by the quote token decimal
     *   places.
     */
    function fetchPrice(bytes memory data) internal view virtual override returns (uint112 price) {
        address token = abi.decode(data, (address));

        // Get the pool tokens and balances
        (address[] memory tokens, uint256[] memory balances, ) = IVault(balancerVault).getPoolTokens(poolId);

        // Get the token index
        uint256 tokenIndex = findTokenIndex(tokens, token);
        if (tokenIndex == type(uint256).max) {
            // The pool doesn't contain the token
            revert TokenNotFound(token);
        }

        (uint256 amp, ) = IStablePool(poolAddress).getAmplificationParameter();
        uint256[] memory scalingFactors = IBasePool(poolAddress).getScalingFactors();

        uint256 amount = computeWholeUnitAmount(token);

        // Fees are subtracted before scaling, to reduce the complexity of the rounding direction analysis.
        amount -= amount.mulUp(IBasePool(poolAddress).getSwapFeePercentage());

        // Scale the amount and balances
        _upscaleArray(balances, scalingFactors, balances.length);
        amount = _upscale(amount, scalingFactors[tokenIndex]);

        uint256[] memory newBalances = new uint256[](2);
        newBalances[0] = balances[tokenIndex];
        newBalances[1] = balances[quoteTokenIndex];

        uint256 invariant = StableMath._calculateInvariant(amp, newBalances);
        uint256 amountOut = StableMath._calcOutGivenIn(amp, newBalances, 0, 1, amount, invariant);

        price = _downscaleDown(amountOut, scalingFactors[quoteTokenIndex]).toUint112();

        if (price == 0) return 1;
    }

    function computeWholeUnitAmount(address token) internal view returns (uint256 amount) {
        amount = uint256(10) ** IERC20Metadata(token).decimals();
    }

    /**
     * @dev Reverses the `scalingFactor` applied to `amount`, resulting in a smaller or equal value depending on
     * whether it needed scaling or not. The result is rounded down.
     */
    function _downscaleDown(uint256 amount, uint256 scalingFactor) internal pure returns (uint256) {
        return FixedPoint.divDown(amount, scalingFactor);
    }

    /**
     * @dev Applies `scalingFactor` to `amount`, resulting in a larger or equal value depending on whether it needed
     * scaling or not.
     */
    function _upscale(uint256 amount, uint256 scalingFactor) internal pure returns (uint256) {
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
    function _upscaleArray(uint256[] memory amounts, uint256[] memory scalingFactors, uint256 numTokens) internal pure {
        for (uint256 i = 0; i < numTokens; ++i) {
            amounts[i] = FixedPoint.mulDown(amounts[i], scalingFactors[i]);
        }
    }
}