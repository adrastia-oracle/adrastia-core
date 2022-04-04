//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

contract UniswapV2PriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    address public immutable uniswapFactory;

    bytes32 public immutable initCodeHash;

    mapping(address => AccumulationLibrary.UniswapV2PriceAccumulator) public uniPriceAccumulations;
    mapping(address => uint112) public uniPrices;

    constructor(
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        uniswapFactory = uniswapFactory_;
        initCodeHash = initCodeHash_;
    }

    function canUpdate(address token) public view virtual override returns (bool) {
        address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

        if (!pairAddress.isContract()) {
            // Pool doesn't exist
            return false;
        }

        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pairAddress).getReserves();
        if (reserve0 == 0 || reserve1 == 0) {
            // Pool doesn't have liquidity
            return false;
        }

        return super.canUpdate(token);
    }

    function _update(address token) internal virtual override returns (bool) {
        return super._update(token);
    }

    function fetchPrice(address token) internal view virtual override returns (uint112 price) {
        address pairAddress = pairFor(uniswapFactory, initCodeHash, token, quoteToken);

        require(pairAddress.isContract(), "UniswapV2PriceAccumulator: POOL_NOT_FOUND");

        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);

        // Note: Reserves are actually stored in uint112, but we promote for handling the math below
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();

        require(reserve0 > 0 && reserve1 > 0, "UniswapV2PriceAccumulator: NO_LIQUIDITY");

        if (token < quoteToken) {
            // reserve0 == tokenLiquidity, reserve1 == quoteTokenLiquidity
            price = ((computeWholeUnitAmount(token) * reserve1) / reserve0).toUint112();
        } else {
            // reserve1 == tokenLiquidity, reserve0 == quoteTokenLiquidity
            price = ((computeWholeUnitAmount(token) * reserve0) / reserve1).toUint112();
        }
    }

    function computeWholeUnitAmount(address token) internal view returns (uint256 amount) {
        amount = uint256(10)**IERC20Metadata(token).decimals();
    }

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2PriceAccumulator: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2PriceAccumulator: ZERO_ADDRESS");
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(
        address factory,
        bytes32 initCodeHash_,
        address tokenA,
        address tokenB
    ) internal pure returns (address pair) {
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
