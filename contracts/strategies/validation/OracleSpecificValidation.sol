//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";

import "./IValidationStrategy.sol";

contract OracleSpecificValidation is IERC165, IValidationStrategy {
    IValidationStrategy public constant NO_VALIDATION_STRATEGY = IValidationStrategy(address(0));
    IValidationStrategy public constant NIL_VALIDATION_STRATEGY = IValidationStrategy(address(1));

    /// @notice The number of decimals of the quote token.
    /// @dev This is used to scale the quote token liquidity value.
    uint8 public immutable override quoteTokenDecimals;

    mapping(address => IValidationStrategy) internal strategies;

    IValidationStrategy internal immutable defaultStrategy;

    constructor(uint8 quoteTokenDecimals_, IValidationStrategy defaultStrategy_) {
        quoteTokenDecimals = quoteTokenDecimals_;
        defaultStrategy = defaultStrategy_;
    }

    /// @inheritdoc IValidationStrategy
    function validateObservation(
        address token,
        ObservationLibrary.MetaObservation calldata observation
    ) external view virtual override returns (bool) {
        IValidationStrategy strategy = _getValidationStrategy(observation.metadata.oracle);
        if (strategy == NO_VALIDATION_STRATEGY) {
            // Validation disabled for this oracle.
            return true;
        }

        return strategy.validateObservation(token, observation);
    }

    function getValidationStrategy(address oracle) external view virtual returns (IValidationStrategy) {
        return _getValidationStrategy(oracle);
    }

    function getDefaultValidationStrategy() external view virtual returns (IValidationStrategy) {
        return _getDefaultValidationStrategy();
    }

    // @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IValidationStrategy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _getDefaultValidationStrategy() internal view virtual returns (IValidationStrategy) {
        return defaultStrategy;
    }

    function _getValidationStrategy(address oracle) internal view virtual returns (IValidationStrategy) {
        IValidationStrategy strategy = strategies[oracle];
        if (strategy != NO_VALIDATION_STRATEGY) {
            // A validation strategy was set for this oracle.

            if (strategy == NIL_VALIDATION_STRATEGY) {
                // The validation strategy was set to nil. Return the no validation strategy.
                return NO_VALIDATION_STRATEGY;
            }

            return strategy;
        }

        // No validation strategy was set for this oracle. Use the default.
        return _getDefaultValidationStrategy();
    }
}
