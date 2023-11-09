// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../AbstractOracle.sol";
import "../../interfaces/IHasPriceAccumulator.sol";
import "../../interfaces/IHasLiquidityAccumulator.sol";
import "../../accumulators/PriceAccumulator.sol";
import "../../accumulators/LiquidityAccumulator.sol";

/**
 * @title AccumulatorOracleView
 * @notice An oracle that uses a price and liquidity accumulator to provide current price and liquidity data.
 * @dev This oracle is not updatable, and it does not need to be updated. However, its underlying accumulators must be
 * updated in order to provide accurate data.
 */
contract AccumulatorOracleView is AbstractOracle, IHasPriceAccumulator, IHasLiquidityAccumulator {
    /// @inheritdoc IHasPriceAccumulator
    address public immutable override priceAccumulator;

    /// @inheritdoc IHasLiquidityAccumulator
    address public immutable override liquidityAccumulator;

    /**
     * @notice Constructor for the AccumulatorOracleView contract.
     * @param liquidityAccumulator_ The address of the liquidity accumulator.
     * @param priceAccumulator_ The address of the price accumulator.
     * @param quoteToken_ The address of the quote token.
     */
    constructor(
        address liquidityAccumulator_,
        address priceAccumulator_,
        address quoteToken_
    ) AbstractOracle(quoteToken_) {
        priceAccumulator = priceAccumulator_;
        liquidityAccumulator = liquidityAccumulator_;
    }

    /// @inheritdoc IOracle
    function liquidityDecimals() public view virtual override returns (uint8) {
        return LiquidityAccumulator(liquidityAccumulator).liquidityDecimals();
    }

    /**
     * @notice Updates the oracle data.
     * @dev This oracle doesn't support updates.
     * @return False as this oracle doesn't support updates.
     */
    function update(bytes memory) public virtual override returns (bool) {
        return false;
    }

    /**
     * @notice Checks if the oracle needs an update.
     * @dev This oracle doesn't support updates.
     * @return False as this oracle doesn't need updates.
     */
    function needsUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    /**
     * @notice Checks if the oracle can be updated.
     * @dev This oracle doesn't support updates.
     * @return False as this oracle can't be updated.
     */
    function canUpdate(bytes memory) public view virtual override returns (bool) {
        return false;
    }

    /**
     * @notice Retrieves the latest observation data by consulting the underlying accumulators.
     * @dev The observation timestamp is the oldest of the two accumulator observation timestamps.
     * @param token The address of the token.
     * @return observation The latest observation data.
     */
    function getLatestObservation(
        address token
    ) public view virtual override returns (ObservationLibrary.Observation memory observation) {
        bytes memory data = abi.encode(token);
        uint256 lastPriceUpdateTime = PriceAccumulator(priceAccumulator).lastUpdateTime(data);
        uint256 lastLiquidityUpdateTime = LiquidityAccumulator(liquidityAccumulator).lastUpdateTime(data);

        (observation.price) = PriceAccumulator(priceAccumulator).consultPrice(token);
        (observation.tokenLiquidity, observation.quoteTokenLiquidity) = LiquidityAccumulator(liquidityAccumulator)
            .consultLiquidity(token);

        // The observation timestamp is the oldest of the two timestamps.
        if (lastPriceUpdateTime < lastLiquidityUpdateTime) {
            observation.timestamp = uint32(lastPriceUpdateTime);
        } else {
            observation.timestamp = uint32(lastLiquidityUpdateTime);
        }
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IHasPriceAccumulator).interfaceId ||
            interfaceId == type(IHasLiquidityAccumulator).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc AbstractOracle
    function instantFetch(
        address token
    ) internal view virtual override returns (uint112 price, uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        price = PriceAccumulator(priceAccumulator).consultPrice(token, 0);
        (tokenLiquidity, quoteTokenLiquidity) = LiquidityAccumulator(liquidityAccumulator).consultLiquidity(token, 0);
    }
}
