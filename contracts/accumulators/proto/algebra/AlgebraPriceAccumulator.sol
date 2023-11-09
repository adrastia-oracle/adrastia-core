// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";
import "../../../libraries/uniswap-lib/FullMath.sol";

/// @dev Credit to Uniswap Labs under GPL-2.0-or-later license:
/// https://github.com/Uniswap/v3-core/tree/main/contracts/interfaces
interface IAlgebraPoolState {
    /**
     * @notice The globalState structure in the pool stores many values but requires only one slot
     * and is exposed as a single method to save gas when accessed externally.
     * @return price The current price of the pool as a sqrt(token1/token0) Q64.96 value;
     * Returns tick The current tick of the pool, i.e. according to the last tick transition that was run;
     * Returns This value may not always be equal to SqrtTickMath.getTickAtSqrtRatio(price) if the price is on a tick
     * boundary;
     * Returns fee The last pool fee value in hundredths of a bip, i.e. 1e-6;
     * Returns timepointIndex The index of the last written timepoint;
     * Returns communityFeeToken0 The community fee percentage of the swap fee in thousandths (1e-3) for token0;
     * Returns communityFeeToken1 The community fee percentage of the swap fee in thousandths (1e-3) for token1;
     * Returns unlocked Whether the pool is currently locked to reentrancy;
     */
    function globalState()
        external
        view
        returns (
            uint160 price,
            int24 tick,
            uint16 fee,
            uint16 timepointIndex,
            uint8 communityFeeToken0,
            uint8 communityFeeToken1,
            bool unlocked
        );

    /**
     * @notice The currently in range liquidity available to the pool
     * @dev This value has no relationship to the total liquidity across all ticks.
     * Returned value cannot exceed type(uint128).max
     */
    function liquidity() external view returns (uint128);
}

contract AlgebraPriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    error InvalidToken(address token);
    error NoLiquidity(address token);

    address public immutable poolDeployer;

    bytes32 public immutable initCodeHash;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address poolDeployer_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        poolDeployer = poolDeployer_;
        initCodeHash = initCodeHash_;
    }

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        address token = abi.decode(data, (address));

        if (token == address(0) || token == quoteToken) {
            // Invalid token
            return false;
        }

        (bool hasLiquidity, ) = calculatePrice(token);
        if (!hasLiquidity) {
            // Can't update if there's no liquidity (reverts)
            return false;
        }

        return super.canUpdate(data);
    }

    function calculatePriceFromSqrtPrice(
        address token,
        address quoteToken_,
        uint160 sqrtPriceX96,
        uint128 tokenAmount
    ) internal pure virtual returns (uint256 price) {
        // Calculate quoteAmount with better precision if it doesn't overflow when multiplied by itself
        if (sqrtPriceX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
            price = token < quoteToken_
                ? FullMath.mulDiv(ratioX192, tokenAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, tokenAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
            price = token < quoteToken_
                ? FullMath.mulDiv(ratioX128, tokenAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, tokenAmount, ratioX128);
        }
    }

    function calculatePrice(address token) internal view virtual returns (bool hasLiquidity, uint256 price) {
        uint128 wholeTokenAmount = computeWholeUnitAmount(token);

        address pool = computeAddress(token, quoteToken);

        if (pool.isContract()) {
            uint256 liquidity = IAlgebraPoolState(pool).liquidity(); // Note: returns uint128
            if (liquidity == 0) {
                // No in-range liquidity
                return (false, 0);
            }

            (uint160 sqrtPriceX96, , , , , , ) = IAlgebraPoolState(pool).globalState();

            uint256 poolPrice = calculatePriceFromSqrtPrice(token, quoteToken, sqrtPriceX96, wholeTokenAmount);

            return (true, poolPrice);
        }

        return (false, 0);
    }

    function fetchPrice(bytes memory data) internal view virtual override returns (uint112) {
        address token = abi.decode(data, (address));
        if (token == quoteToken || token == address(0)) {
            // Invalid token
            revert InvalidToken(token);
        }

        (bool hasLiquidity, uint256 _price) = calculatePrice(token);

        // Note: Will cause prices calculated from accumulations to be fixed to the last price
        if (!hasLiquidity) {
            revert NoLiquidity(token);
        }

        if (_price == 0) return 1;

        return _price.toUint112();
    }

    function computeAddress(address token, address _quoteToken) internal view virtual returns (address pool) {
        if (token > _quoteToken) {
            // Sort tokens so that the first token is the one with the lower address
            (token, _quoteToken) = (_quoteToken, token);
        }

        pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(hex"ff", poolDeployer, keccak256(abi.encode(token, _quoteToken)), initCodeHash)
                    )
                )
            )
        );
    }

    function computeWholeUnitAmount(address token) internal view virtual returns (uint128 amount) {
        amount = uint128(10) ** IERC20Metadata(token).decimals();
    }
}
