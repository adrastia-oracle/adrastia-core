// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol";

import "../../LiquidityAccumulator.sol";

contract UniswapV3LiquidityAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCast for uint256;

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    address public immutable uniswapFactory;

    bytes32 public immutable initCodeHash;

    uint24[] public poolFees;

    uint8 internal immutable _liquidityDecimals;

    uint256 internal immutable _decimalFactor;

    uint256 internal immutable _quoteTokenWholeUnit;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        uniswapFactory = uniswapFactory_;
        initCodeHash = initCodeHash_;
        poolFees = poolFees_;
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

    /// @notice Returns PoolKey: the ordered tokens with the matched fee levels
    /// @param tokenA The first token of a pool, unsorted
    /// @param tokenB The second token of a pool, unsorted
    /// @param fee The fee level of the pool
    /// @return Poolkey The pool details with ordered token0 and token1 assignments
    function getPoolKey(address tokenA, address tokenB, uint24 fee) internal pure virtual returns (PoolKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);
        return PoolKey({token0: tokenA, token1: tokenB, fee: fee});
    }

    /// @notice Deterministically computes the pool address given the factory and PoolKey
    /// @param factory The Uniswap V3 factory contract address
    /// @param key The PoolKey
    /// @return pool The contract address of the V3 pool
    function computeAddress(
        address factory,
        bytes32 _initCodeHash,
        PoolKey memory key
    ) internal pure virtual returns (address pool) {
        require(key.token0 < key.token1);
        pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encode(key.token0, key.token1, key.fee)),
                            _initCodeHash
                        )
                    )
                )
            )
        );
    }

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));

        require(token != address(0), "UniswapV3LiquidityAccumulator: INVALID_TOKEN");

        uint256 tokenLiquidity_;
        uint256 quoteTokenLiquidity_;

        uint256 fees0;
        uint256 fees1;

        address _uniswapFactory = uniswapFactory;
        address _quoteToken = quoteToken;
        uint24[] memory _poolFees = poolFees;

        for (uint256 i = 0; i < _poolFees.length; ++i) {
            address pool = computeAddress(_uniswapFactory, initCodeHash, getPoolKey(token, _quoteToken, _poolFees[i]));

            if (pool.isContract()) {
                uint256 liquidity = IUniswapV3Pool(pool).liquidity();
                if (liquidity == 0) {
                    // No in-range liquidity, so ignore
                    continue;
                }

                tokenLiquidity_ += IERC20Minimal(token).balanceOf(pool);
                quoteTokenLiquidity_ += IERC20Minimal(_quoteToken).balanceOf(pool);

                (uint128 token0, uint128 token1) = IUniswapV3Pool(pool).protocolFees();

                fees0 += token0;
                fees1 += token1;
            }
        }

        // Subtract protocol fees from the totals
        if (token < _quoteToken) {
            tokenLiquidity_ -= fees0;
            quoteTokenLiquidity_ -= fees1;
        } else {
            tokenLiquidity_ -= fees1;
            quoteTokenLiquidity_ -= fees0;
        }

        tokenLiquidity = ((tokenLiquidity_ * _decimalFactor) / 10 ** IERC20Metadata(token).decimals()).toUint112();
        quoteTokenLiquidity = ((quoteTokenLiquidity_ * _decimalFactor) / _quoteTokenWholeUnit).toUint112();
    }
}
