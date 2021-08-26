//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "../interfaces/IDataSource.sol";
import "../interfaces/ILiquidityAccumulator.sol";
import "../libraries/ObservationLibrary.sol";

import "@uniswap-mirror/v3-core/contracts/libraries/FullMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract LiquidityAccumulator is ILiquidityAccumulator {

    using SafeMath for uint256;

    uint256 constant public CHANGE_PRECISION = 10**8;

    address immutable public dataSource;
    uint256 immutable public updateThreshold;

    address immutable public override quoteToken;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) accumulations;
    mapping(address => ObservationLibrary.LiquidityObservation) observations;

    constructor(address dataSource_, uint256 updateTheshold_) {
        dataSource = dataSource_;
        quoteToken = IDataSource(dataSource_).quoteToken();
        updateThreshold = updateTheshold_;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];
        if (lastObservation.timestamp == 0) // No observation -> needs update
            return true;

        (bool success, uint256 tokenLiquidity, uint256 quoteTokenLiquidity) = IDataSource(dataSource).fetchLiquidity(token);
        if (!success)
            return false;

        uint256 tokenLiquidityChange = calculateChange(tokenLiquidity, lastObservation.tokenLiquidity);
        uint256 quoteTokenLiquidityChange = calculateChange(quoteTokenLiquidity, lastObservation.quoteTokenLiquidity);

        return tokenLiquidityChange >= updateThreshold || quoteTokenLiquidityChange >= updateThreshold;
    }

    function update(address token) override virtual external {
        if (needsUpdate(token)) {
            (bool success, uint256 tokenLiquidity, uint256 quoteTokenLiquidity) = IDataSource(dataSource).fetchLiquidity(token);
            if (!success)
                return;

            ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];
            AccumulationLibrary.LiquidityAccumulator storage accumulation = accumulations[token];

            if (lastObservation.timestamp == 0) {
                // Initialize

                accumulation.cumulativeTokenLiquidity = lastObservation.tokenLiquidity = tokenLiquidity;
                accumulation.cumulativeQuoteTokenLiquidity = lastObservation.quoteTokenLiquidity = quoteTokenLiquidity;
                accumulation.timestamp = lastObservation.timestamp = block.timestamp;

                return;
            }

            // Update

            uint256 deltaTime = block.timestamp - lastObservation.timestamp;

            if (deltaTime != 0) {
                // TODO: Handle overflows
                accumulation.cumulativeTokenLiquidity += tokenLiquidity * deltaTime;
                accumulation.cumulativeQuoteTokenLiquidity += quoteTokenLiquidity * deltaTime;
                accumulation.timestamp = block.timestamp;
            }

            lastObservation.tokenLiquidity = tokenLiquidity;
            lastObservation.quoteTokenLiquidity = quoteTokenLiquidity;
            lastObservation.timestamp = block.timestamp;
        }
    }

    function getAccumulation(address token) override virtual public view
        returns(AccumulationLibrary.LiquidityAccumulator memory)
    {
        return accumulations[token];
    }

    function calculateLiquidity(AccumulationLibrary.LiquidityAccumulator memory firstAccumulation, AccumulationLibrary.LiquidityAccumulator memory secondAccumulation) override virtual public pure
        returns(uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        uint256 deltaTime = secondAccumulation.timestamp.sub(firstAccumulation.timestamp);
        require(deltaTime != 0, "LiquidityAccumulator: delta time cannot be 0.");

        tokenLiquidity = (secondAccumulation.cumulativeTokenLiquidity.sub(firstAccumulation.cumulativeTokenLiquidity)).div(deltaTime);
        quoteTokenLiquidity = (secondAccumulation.cumulativeQuoteTokenLiquidity.sub(firstAccumulation.cumulativeQuoteTokenLiquidity)).div(deltaTime);
    }

    function calculateChange(uint256 a, uint256 b) internal pure returns(uint256) {
        // Ensure a is never smaller than b
        if (a < b) {
            uint256 temp = a;
            a = b;
            b = temp;
        }

        uint256 delta = a - b; // Safe: a is never smaller than b

        return FullMath.mulDiv(delta, CHANGE_PRECISION, b);
    }

}
