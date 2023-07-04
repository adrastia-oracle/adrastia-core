//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/IERC20.sol";

import "../../../libraries/SafeCastExt.sol";

import "../../LiquidityAccumulator.sol";

/// @dev Credit to Uniswap Labs under GPL-2.0-or-later license:
/// https://github.com/Uniswap/v3-core/tree/main/contracts/interfaces
interface IAlgebraPoolState {
    /**
     * @notice The currently in range liquidity available to the pool
     * @dev This value has no relationship to the total liquidity across all ticks.
     * Returned value cannot exceed type(uint128).max
     */
    function liquidity() external view returns (uint128);
}

contract AlgebraLiquidityAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    error InvalidToken(address token);

    address public immutable poolDeployer;

    bytes32 public immutable initCodeHash;

    uint8 internal immutable _liquidityDecimals;

    uint256 internal immutable _decimalFactor;

    uint256 internal immutable _quoteTokenWholeUnit;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address poolDeployer_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        poolDeployer = poolDeployer_;
        initCodeHash = initCodeHash_;
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

        return super.canUpdate(data);
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
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

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));
        address _quoteToken = quoteToken;
        if (token == _quoteToken || token == address(0)) {
            revert InvalidToken(token);
        }

        uint256 tokenLiquidity_;
        uint256 quoteTokenLiquidity_;

        address pool = computeAddress(token, _quoteToken);

        if (pool.isContract()) {
            uint256 liquidity = IAlgebraPoolState(pool).liquidity();
            if (liquidity == 0) {
                // No in-range liquidity
                return (0, 0);
            }

            tokenLiquidity_ += IERC20(token).balanceOf(pool);
            quoteTokenLiquidity_ += IERC20(_quoteToken).balanceOf(pool);
        }

        tokenLiquidity = ((tokenLiquidity_ * _decimalFactor) / 10 ** IERC20Metadata(token).decimals()).toUint112();
        quoteTokenLiquidity = ((quoteTokenLiquidity_ * _decimalFactor) / _quoteTokenWholeUnit).toUint112();
    }
}
