// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/PriceAccumulator.sol";

contract PriceAccumulatorStub is PriceAccumulator {
    struct Config {
        bool changeThresholdOverridden;
        bool changeThresholdPassed;
        bool needsUpdateOverridden;
        bool needsUpdate;
        bool validateObservationOverridden;
        bool validateObservation;
        bool useLastAccumulationAsCurrent;
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

    function stubSetObservation(
        address token,
        uint112 price,
        uint32 timestamp
    ) public {
        ObservationLibrary.PriceObservation storage observation = observations[token];

        observation.price = price;
        observation.timestamp = timestamp;
    }

    function stubSetAccumulation(
        address token,
        uint112 cumulativePrice,
        uint32 timestamp
    ) public {
        AccumulationLibrary.PriceAccumulator storage accumulation = accumulations[token];

        accumulation.cumulativePrice = cumulativePrice;
        accumulation.timestamp = timestamp;
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

    function overrideCurrentAccumulation(bool useLastAccumulationAsCurrent) public {
        config.useLastAccumulationAsCurrent = useLastAccumulationAsCurrent;
    }

    function stubFetchPrice(address token) public view returns (uint256 price) {
        return fetchPrice(token);
    }

    function harnessChangeThresholdSurpassed(
        uint256 a,
        uint256 b,
        uint256 updateThreshold
    ) public view returns (bool) {
        return changeThresholdSurpassed(a, b, updateThreshold);
    }

    function stubValidateObservation(bytes memory updateData, uint112 price) public returns (bool) {
        return super.validateObservation(updateData, price);
    }

    /* Overridden functions */

    function needsUpdate(bytes memory data) public view virtual override returns (bool) {
        if (config.needsUpdateOverridden) return config.needsUpdate;
        else return super.needsUpdate(data);
    }

    function validateObservation(bytes memory updateData, uint112 price) internal virtual override returns (bool) {
        if (config.validateObservationOverridden) return config.validateObservation;
        else return super.validateObservation(updateData, price);
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

    function getCurrentAccumulation(address token)
        public
        view
        virtual
        override
        returns (AccumulationLibrary.PriceAccumulator memory accumulation)
    {
        if (config.useLastAccumulationAsCurrent) return getLastAccumulation(token);
        else return super.getCurrentAccumulation(token);
    }
}

contract PriceAccumulatorStubCaller {
    PriceAccumulatorStub immutable callee;

    constructor(PriceAccumulatorStub callee_) {
        callee = callee_;
    }

    function stubValidateObservation(address token, uint112 price) public returns (bool) {
        return callee.stubValidateObservation(abi.encode(token), price);
    }
}
