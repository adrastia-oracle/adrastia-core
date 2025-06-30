// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {SafeCast} from "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";
import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../LiquidityAccumulator.sol";

contract StaticLiquidityAccumulator is LiquidityAccumulator {
    using AddressLibrary for address;
    using SafeCast for uint256;

    uint8 internal immutable _liquidityDecimals;

    uint112 internal immutable staticTokenLiquidity;
    uint112 internal immutable staticQuoteTokenLiquidity;

    constructor(
        address quoteToken_,
        uint8 decimals_,
        uint112 tokenLiquidity_,
        uint112 quoteTokenLiquidity_
    ) LiquidityAccumulator(IAveragingStrategy(address(0)), quoteToken_, 1, 1, 2) {
        _liquidityDecimals = decimals_;
        staticTokenLiquidity = tokenLiquidity_;
        staticQuoteTokenLiquidity = quoteTokenLiquidity_;
    }

    function calculateLiquidity(
        AccumulationLibrary.LiquidityAccumulator calldata,
        AccumulationLibrary.LiquidityAccumulator calldata
    ) external view virtual override returns (uint112, uint112) {
        return (staticTokenLiquidity, staticQuoteTokenLiquidity);
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function needsUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    function canUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    function update(bytes memory) public virtual override returns (bool) {
        return false;
    }

    function lastUpdateTime(bytes memory) public view virtual override returns (uint256) {
        return block.timestamp;
    }

    function timeSinceLastUpdate(bytes memory) public view virtual override returns (uint256) {
        return 0;
    }

    /// @inheritdoc ILiquidityAccumulator
    function getLastAccumulation(
        address
    ) public view virtual override returns (AccumulationLibrary.LiquidityAccumulator memory) {
        return
            AccumulationLibrary.LiquidityAccumulator({
                cumulativeTokenLiquidity: 0,
                cumulativeQuoteTokenLiquidity: 0,
                timestamp: uint32(block.timestamp)
            });
    }

    /// @inheritdoc ILiquidityAccumulator
    function getCurrentAccumulation(
        address
    ) public view virtual override returns (AccumulationLibrary.LiquidityAccumulator memory) {
        return
            AccumulationLibrary.LiquidityAccumulator({
                cumulativeTokenLiquidity: 0,
                cumulativeQuoteTokenLiquidity: 0,
                timestamp: uint32(block.timestamp)
            });
    }

    /// @inheritdoc ILiquidityOracle
    function consultLiquidity(address) public view virtual override returns (uint112, uint112) {
        return (staticTokenLiquidity, staticQuoteTokenLiquidity);
    }

    function consultLiquidity(address, uint256) public view virtual override returns (uint112, uint112) {
        return (staticTokenLiquidity, staticQuoteTokenLiquidity);
    }

    function fetchLiquidity(bytes memory, uint256) internal view virtual override returns (uint112, uint112) {
        return (staticTokenLiquidity, staticQuoteTokenLiquidity);
    }
}
