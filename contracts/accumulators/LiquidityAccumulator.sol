//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

pragma experimental ABIEncoderV2;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin-v4/contracts/utils/math/SafeCast.sol";

import "../interfaces/ILiquidityAccumulator.sol";
import "../interfaces/ILiquidityOracle.sol";
import "../libraries/ObservationLibrary.sol";
import "../libraries/AddressLibrary.sol";
import "../utils/SimpleQuotationMetadata.sol";

abstract contract LiquidityAccumulator is IERC165, ILiquidityAccumulator, ILiquidityOracle, SimpleQuotationMetadata {
    using AddressLibrary for address;
    using SafeCast for uint256;

    struct PendingObservation {
        uint32 blockNumber;
        uint112 tokenLiquidity;
        uint112 quoteTokenLiquidity;
    }

    uint256 public constant OBSERVATION_BLOCK_MIN_PERIOD = 10;
    uint256 public constant OBSERVATION_BLOCK_MAX_PERIOD = 20;

    uint256 internal constant CHANGE_PRECISION_DECIMALS = 8;
    uint256 internal constant CHANGE_PRECISION = 10**CHANGE_PRECISION_DECIMALS;

    uint256 public immutable updateThreshold;
    uint256 public immutable minUpdateDelay;
    uint256 public immutable maxUpdateDelay;

    uint256 public immutable override changePrecision = CHANGE_PRECISION;

    mapping(address => AccumulationLibrary.LiquidityAccumulator) public accumulations;
    mapping(address => ObservationLibrary.LiquidityObservation) public observations;

    /// @notice Stores observations held for OBSERVATION_BLOCK_PERIOD before being committed to an update.
    /// @dev address(token) => address(poster) => PendingObservation
    mapping(address => mapping(address => PendingObservation)) public pendingObservations;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) SimpleQuotationMetadata(quoteToken_) {
        updateThreshold = updateThreshold_;
        minUpdateDelay = minUpdateDelay_;
        maxUpdateDelay = maxUpdateDelay_;
    }

    /// @inheritdoc ILiquidityAccumulator
    function calculateLiquidity(
        AccumulationLibrary.LiquidityAccumulator calldata firstAccumulation,
        AccumulationLibrary.LiquidityAccumulator calldata secondAccumulation
    ) external pure virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        require(firstAccumulation.timestamp != 0, "LiquidityAccumulator: TIMESTAMP_CANNOT_BE_ZERO");

        uint32 deltaTime = secondAccumulation.timestamp - firstAccumulation.timestamp;
        require(deltaTime != 0, "LiquidityAccumulator: DELTA_TIME_CANNOT_BE_ZERO");

        unchecked {
            // Underflow is desired and results in correct functionality
            tokenLiquidity =
                (secondAccumulation.cumulativeTokenLiquidity - firstAccumulation.cumulativeTokenLiquidity) /
                deltaTime;
            quoteTokenLiquidity =
                (secondAccumulation.cumulativeQuoteTokenLiquidity - firstAccumulation.cumulativeQuoteTokenLiquidity) /
                deltaTime;
        }
    }

    /// Checks if this accumulator needs an update by checking the time since the last update and the change in
    ///   liquidities.
    /// @inheritdoc IUpdateByToken
    function needsUpdate(address token) public view virtual override returns (bool) {
        ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];

        uint256 deltaTime = block.timestamp - lastObservation.timestamp;
        if (deltaTime < minUpdateDelay) {
            // Ensures updates occur at most once every minUpdateDelay (seconds)
            return false;
        } else if (deltaTime >= maxUpdateDelay) {
            // Ensures updates occur (optimistically) at least once every maxUpdateDelay (seconds)
            return true;
        }

        /*
         * maxUpdateDelay > deltaTime >= minUpdateDelay
         *
         * Check if the % change in liquidity warrents an update (saves gas vs. always updating on change)
         */

        (uint256 tokenLiquidity, uint256 quoteTokenLiquidity) = fetchLiquidity(token);

        return
            changeThresholdSurpassed(tokenLiquidity, lastObservation.tokenLiquidity, updateThreshold) ||
            changeThresholdSurpassed(quoteTokenLiquidity, lastObservation.quoteTokenLiquidity, updateThreshold);
    }

    /// @inheritdoc IUpdateByToken
    function canUpdate(address token) public view virtual override returns (bool) {
        // If this accumulator doesn't need an update, it can't (won't) update
        if (!needsUpdate(token)) return false;

        PendingObservation storage pendingObservation = pendingObservations[token][msg.sender];

        // Check if pending update can be initialized (or if it's the first update)
        if (pendingObservation.blockNumber == 0) return true;

        // Validating observation (second update call)

        // Check if observation period has passed
        if (block.number - pendingObservation.blockNumber < OBSERVATION_BLOCK_MIN_PERIOD) return false;

        return true;
    }

    /// @notice Updates the accumulator.
    /// @dev Must be called by an EOA to limit the attack vector, unless it's the first observation for a token.
    /// @param token The address of the token to accumulate the liquidities of.
    /// @return updated True if anything (other than a pending observation) was updated; false otherwise.
    function update(address token) external virtual override returns (bool) {
        if (needsUpdate(token)) return _update(token);

        return false;
    }

    /// @inheritdoc ILiquidityAccumulator
    function getLastAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.LiquidityAccumulator memory)
    {
        return accumulations[token];
    }

    /// @inheritdoc ILiquidityAccumulator
    function getCurrentAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.LiquidityAccumulator memory accumulation)
    {
        ObservationLibrary.LiquidityObservation storage lastObservation = observations[token];
        require(lastObservation.timestamp != 0, "LiquidityAccumulator: UNINITIALIZED");

        accumulation = accumulations[token]; // Load last accumulation

        uint32 deltaTime = (block.timestamp - lastObservation.timestamp).toUint32();

        if (deltaTime != 0) {
            // The last observation liquidities have existed for some time, so we add that
            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the liquidites multiplied by the time those liquidities were present
                accumulation.cumulativeTokenLiquidity += lastObservation.tokenLiquidity * deltaTime;
                accumulation.cumulativeQuoteTokenLiquidity += lastObservation.quoteTokenLiquidity * deltaTime;

                accumulation.timestamp = block.timestamp.toUint32();
            }
        }
    }

    /// @inheritdoc ILiquidityAccumulator
    function getLastObservation(address token)
        public
        view
        virtual
        override
        returns (ObservationLibrary.LiquidityObservation memory)
    {
        return observations[token];
    }

    /// @inheritdoc ILiquidityAccumulator
    function getCurrentObservation(address token)
        public
        view
        virtual
        override
        returns (ObservationLibrary.LiquidityObservation memory observation)
    {
        (observation.tokenLiquidity, observation.quoteTokenLiquidity) = fetchLiquidity(token);
        observation.timestamp = block.timestamp.toUint32();
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(IERC165, SimpleQuotationMetadata)
        returns (bool)
    {
        return
            interfaceId == type(ILiquidityAccumulator).interfaceId ||
            interfaceId == type(ILiquidityOracle).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc ILiquidityOracle
    function consultLiquidity(address token)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        return fetchLiquidity(token);
    }

    /// @inheritdoc ILiquidityOracle
    function consultLiquidity(address token, uint256)
        public
        view
        virtual
        override
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        return fetchLiquidity(token);
    }

    function _update(address token) internal virtual returns (bool) {
        (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) = fetchLiquidity(token);

        ObservationLibrary.LiquidityObservation storage observation = observations[token];
        AccumulationLibrary.LiquidityAccumulator storage accumulation = accumulations[token];

        if (observation.timestamp == 0) {
            /*
             * Initialize
             */
            observation.tokenLiquidity = tokenLiquidity;
            observation.quoteTokenLiquidity = quoteTokenLiquidity;
            observation.timestamp = block.timestamp.toUint32();

            emit Updated(token, tokenLiquidity, quoteTokenLiquidity, block.timestamp);

            return true;
        }

        /*
         * Update
         */

        uint32 deltaTime = (block.timestamp - observation.timestamp).toUint32();

        if (deltaTime != 0) {
            // Validate that the observation stays approximately the same for OBSERVATION_BLOCK_PERIOD blocks.
            // This limits the following manipulation:
            //   A user adds a lot of liquidity to a [low liquidity] pool with an invalid price, updates this
            //   accumulator, then removes the liquidity in a single transaction.
            // By spanning the observation over a number of blocks, arbitrageurs will take the attacker's funds
            // and stop/limit such an attack.
            if (!validateObservation(token, tokenLiquidity, quoteTokenLiquidity)) return false;

            unchecked {
                // Overflow is desired and results in correct functionality
                // We add the liquidites multiplied by the time those liquidities were present
                accumulation.cumulativeTokenLiquidity += observation.tokenLiquidity * deltaTime;
                accumulation.cumulativeQuoteTokenLiquidity += observation.quoteTokenLiquidity * deltaTime;

                observation.tokenLiquidity = tokenLiquidity;
                observation.quoteTokenLiquidity = quoteTokenLiquidity;

                observation.timestamp = accumulation.timestamp = block.timestamp.toUint32();
            }

            emit Updated(token, tokenLiquidity, quoteTokenLiquidity, block.timestamp);

            return true;
        }

        return false;
    }

    function validateObservation(
        address token,
        uint112 tokenLiquidity,
        uint112 quoteTokenLiquidity
    ) internal virtual returns (bool) {
        // Require updaters to be EOAs to limit the attack vector that this function addresses
        // Note: isContract will return false in the constructor of contracts, but since we require two observations
        //   from the same updater spanning across several blocks, the second call will always return true if the caller
        //   is a smart contract.
        require(!msg.sender.isContract() && msg.sender == tx.origin, "LiquidityAccumulator: MUST_BE_EOA");

        PendingObservation storage pendingObservation = pendingObservations[token][msg.sender];

        if (pendingObservation.blockNumber == 0) {
            // New observation (first update call), store it
            pendingObservation.blockNumber = block.number.toUint32();
            pendingObservation.tokenLiquidity = tokenLiquidity;
            pendingObservation.quoteTokenLiquidity = quoteTokenLiquidity;

            return false; // Needs to validate this observation
        }

        // Validating observation (second update call)

        // Check if observation period has passed
        if (block.number - pendingObservation.blockNumber < OBSERVATION_BLOCK_MIN_PERIOD) return false;

        // Check if the observations are approximately the same, and that the observation has not spanned too many
        // blocks
        bool validated = block.number - pendingObservation.blockNumber <= OBSERVATION_BLOCK_MAX_PERIOD &&
            !changeThresholdSurpassed(tokenLiquidity, pendingObservation.tokenLiquidity, updateThreshold) &&
            !changeThresholdSurpassed(quoteTokenLiquidity, pendingObservation.quoteTokenLiquidity, updateThreshold);

        // Validation performed. Delete the pending observation
        delete pendingObservations[token][msg.sender];

        return validated;
    }

    function changeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateTheshold
    ) internal view virtual returns (bool) {
        // Ensure a is never smaller than b
        if (a < b) {
            uint256 temp = a;
            a = b;
            b = temp;
        }

        // a >= b

        if (a == 0) {
            // a == b == 0 (since a >= b), therefore no change
            return false;
        } else if (b == 0) {
            // (a > 0 && b == 0) => change threshold passed
            // Zero to non-zero always returns true
            return true;
        }

        unchecked {
            uint256 delta = a - b; // a >= b, therefore no underflow
            uint256 preciseDelta = delta * CHANGE_PRECISION;

            // If the delta is so large that multiplying by CHANGE_PRECISION overflows, we assume that
            // the change threshold has been surpassed.
            // If our assumption is incorrect, the accumulator will be extra-up-to-date, which won't
            // really break anything, but will cost more gas in keeping this accumulator updated.
            if (preciseDelta < delta) return true;

            uint256 change = preciseDelta / b;

            return change >= updateTheshold;
        }
    }

    function fetchLiquidity(address token)
        internal
        view
        virtual
        returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity);
}
