// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "../../accumulators/PriceAccumulator.sol";

contract PriceAccumulatorStub is PriceAccumulator {
    struct Config {
        bool changeThresholdOverridden;
        bool changeThresholdPassed;
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool validateObservationOverridden;
        bool validateObservation;
    }

    mapping(address => uint112) public mockPrices;

    Config public config;

    constructor(
        address quoteToken_,
        uint256 updateThreshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) PriceAccumulator(quoteToken_, updateThreshold_, minUpdateDelay_, maxUpdateDelay_) {}

    /* Stub functions */

    function setPrice(address token, uint112 price) public {
        mockPrices[token] = price;
    }

    function setPendingObservation(
        address token,
        uint112 price,
        uint32 blockNumber
    ) public {
        pendingObservations[token][msg.sender] = PendingObservation({blockNumber: blockNumber, price: price});
    }

    function overrideChangeThresholdPassed(bool overridden, bool changeThresholdPassed) public {
        config.changeThresholdOverridden = overridden;
        config.changeThresholdPassed = changeThresholdPassed;
    }

    function overrideNeedsUpdate(bool overridden, bool needsUpdate_) public {
        config.needsUpdateOverridden = overridden;
        config.needsUpdate = needsUpdate_;
    }

    function overrideValidateObservation(bool overridden, bool validateObservation_) public {
        config.validateObservationOverridden = overridden;
        config.validateObservation = validateObservation_;
    }

    function harnessChangeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateThreshold
    ) public view returns (bool) {
        return changeThresholdSurpassed(a, b, updateThreshold);
    }

    function stubValidateObservation(address token, uint112 price) public returns (bool) {
        return super.validateObservation(token, price);
    }

    /* Overridden functions */

    function needsUpdate(address token) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(token);
    }

    function validateObservation(address token, uint112 price) internal virtual override returns (bool) {
        if (config.validateObservationOverridden) return config.validateObservation;
        else return super.validateObservation(token, price);
    }

    function fetchPrice(address token) internal view virtual override returns (uint112) {
        return mockPrices[token];
    }

    function changeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateThreshold
    ) internal view virtual override returns (bool) {
        if (config.changeThresholdOverridden) return config.changeThresholdPassed;
        else return super.changeThresholdSurpassed(a, b, updateThreshold);
    }
}

contract PriceAccumulatorStubCaller {
    PriceAccumulatorStub immutable callee;

    constructor(PriceAccumulatorStub callee_) {
        callee = callee_;
    }

    function stubValidateObservation(address token, uint112 price) public returns (bool) {
        return callee.stubValidateObservation(token, price);
    }
}
