// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";

interface IVault {
    function getPoolTokens(
        bytes32 poolId
    ) external view returns (address[] memory tokens, uint256[] memory balances, uint256 lastChangeBlock);

    function getPool(bytes32 poolId) external view returns (address poolAddress, uint8 numTokens);
}

interface IBasePool {
    function getPausedState()
        external
        view
        returns (bool paused, uint256 pauseWindowEndTime, uint256 bufferPeriodEndTime);

    function paused() external view returns (bool);
}

interface IWeightedPool {
    function getNormalizedWeights() external view returns (uint256[] memory normalizedWeights);
}

contract BalancerV2WeightedPriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCast for uint256;

    address public immutable balancerVault;
    address public immutable poolAddress;
    bytes32 public immutable poolId;

    uint256 internal immutable quoteTokenIndex;

    /// @dev 1e18 = 100%, so dividing weights by this allows for a percentage with 2 decimal places of precision.
    uint256 internal immutable weightDescaler = 1e14;

    error TokenNotFound(address token);

    error PoolIsPaused(address pool);

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

        if (isPaused(poolAddress)) {
            // The pool is in recovery mode
            return false;
        }

        (address[] memory tokens, uint256[] memory balances, ) = IVault(balancerVault).getPoolTokens(poolId);
        uint256 tokenIndex = findTokenIndex(tokens, token);
        if (tokenIndex == type(uint256).max) {
            // The pool doesn't contain the token
            return false;
        }

        if (balances[tokenIndex] == 0) {
            // The token has no balance in the pool
            return false;
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

    function findTokenIndex(address[] memory tokens, address token) internal pure virtual returns (uint256) {
        uint256 length = tokens.length;
        for (uint256 i = 0; i < length; ++i) {
            if (tokens[i] == token) {
                return i;
            }
        }

        return type(uint256).max;
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
        uint256 tokenIndex = findTokenIndex(tokens, token);
        if (tokenIndex == type(uint256).max) {
            // The pool doesn't contain the token
            revert TokenNotFound(token);
        }

        // Get the token balance
        uint256 tokenBalance = balances[tokenIndex];
        uint256 quoteTokenBalance = balances[quoteTokenIndex];

        // Get the normalized weights
        uint256[] memory normalizedWeights = IWeightedPool(poolAddress).getNormalizedWeights();

        // Compute the whole unit amount
        uint256 wholeUnitAmount = computeWholeUnitAmount(token);

        // Calculate the price
        price = (((quoteTokenBalance / (normalizedWeights[quoteTokenIndex] / weightDescaler)) * wholeUnitAmount) /
            (tokenBalance / (normalizedWeights[tokenIndex] / weightDescaler))).toUint112();

        if (price == 0) return 1;
    }

    function computeWholeUnitAmount(address token) internal view virtual returns (uint256 amount) {
        amount = uint256(10) ** IERC20Metadata(token).decimals();
    }
}
