// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../../LiquidityAccumulator.sol";

contract UniswapV2LiquidityAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCast for uint256;

    address public immutable uniswapFactory;

    bytes32 public immutable initCodeHash;

    uint8 internal immutable _liquidityDecimals;

    uint256 internal immutable _decimalFactor;

    uint256 internal immutable _quoteTokenWholeUnit;

    constructor(
        IAveragingStrategy averagingStrategy_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        uniswapFactory = uniswapFactory_;
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

        address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

        if (!pairAddress.isContract()) {
            // Pool doesn't exist
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

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        return fetchLiquidity(data, 0 /* not used - save on gas */);
    }

    function fetchLiquidity(
        bytes memory data,
        uint256 /* maxAge */ // maxAge is not used in this implementation
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));

        address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

        require(pairAddress.isContract(), "UniswapV2LiquidityAccumulator: POOL_NOT_FOUND");

        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pairAddress).getReserves();

        if (token < quoteToken) {
            tokenLiquidity = reserve0;
            quoteTokenLiquidity = reserve1;
        } else {
            tokenLiquidity = reserve1;
            quoteTokenLiquidity = reserve0;
        }

        tokenLiquidity = ((uint256(tokenLiquidity) * _decimalFactor) / 10 ** IERC20Metadata(token).decimals())
            .toUint112();
        quoteTokenLiquidity = ((uint256(quoteTokenLiquidity) * _decimalFactor) / _quoteTokenWholeUnit).toUint112();
    }

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure virtual returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2Library: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        bytes32 initCodeHash_,
        address tokenA,
        address tokenB
    ) internal pure virtual returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(hex"ff", factory, keccak256(abi.encodePacked(token0, token1)), initCodeHash_)
                    )
                )
            )
        );
    }
}
