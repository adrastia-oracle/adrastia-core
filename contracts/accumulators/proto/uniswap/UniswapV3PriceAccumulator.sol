//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../PriceAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";
import "../../../utils/IUniswapV3Util.sol";

contract UniswapV3PriceAccumulator is PriceAccumulator {
    using AddressLibrary for address;
    using SafeCastExt for uint256;

    /// @notice The identifying key of the pool
    struct PoolKey {
        address token0;
        address token1;
        uint24 fee;
    }

    address public immutable uniswapUtil;

    address public immutable uniswapFactory;

    bytes32 public immutable initCodeHash;

    uint24[] public poolFees;

    constructor(
        address uniswapUtil_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        uniswapUtil = uniswapUtil_;
        uniswapFactory = uniswapFactory_;
        initCodeHash = initCodeHash_;
        poolFees = poolFees_;
    }

    function canUpdate(address token) public view virtual override returns (bool) {
        (bool hasLiquidity, ) = calculateWeightedPrice(token);
        if (!hasLiquidity) {
            // Can't update if there's no liquidity (reverts)
            return false;
        }

        return super.canUpdate(token);
    }

    function calculateWeightedPrice(address token) internal view returns (bool hasLiquidity, uint256 price) {
        // Calculate "current" price
        (hasLiquidity, price) = IUniswapV3Util(uniswapUtil).calculateWeightedPrice(
            IUniswapV3Util.CalculateWeightedPriceParams({
                token: token,
                quoteToken: quoteToken,
                tokenAmount: computeWholeUnitAmount(token),
                uniswapFactory: uniswapFactory,
                initCodeHash: initCodeHash,
                poolFees: poolFees,
                period: uint32(10) // 10 seconds
            })
        );
    }

    function fetchPrice(address token) internal view virtual override returns (uint112) {
        (bool hasLiquidity, uint256 _price) = calculateWeightedPrice(token);

        // Note: Will cause prices calculated from accumulations to be fixed to the last price
        require(hasLiquidity, "UniswapV3PriceAccumulator: NO_LIQUIDITY");

        return _price.toUint112();
    }

    function computeWholeUnitAmount(address token) internal view returns (uint128 amount) {
        amount = uint128(10)**IERC20Metadata(token).decimals();
    }
}
