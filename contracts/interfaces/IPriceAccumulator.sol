//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

pragma experimental ABIEncoderV2;

import "./IUpdateByToken.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract IPriceAccumulator is IUpdateByToken {
    function quoteToken() external view virtual returns (address);

    function changePrecisionDecimals() external view virtual returns (uint256);

    function getLastAccumulation(address token)
        public
        view
        virtual
        returns (AccumulationLibrary.PriceAccumulator memory);

    function getCurrentAccumulation(address token)
        public
        view
        virtual
        returns (AccumulationLibrary.PriceAccumulator memory);

    function getLastObservation(address token) public view virtual returns (ObservationLibrary.PriceObservation memory);

    function getCurrentObservation(address token)
        public
        view
        virtual
        returns (ObservationLibrary.PriceObservation memory);

    function calculatePrice(
        AccumulationLibrary.PriceAccumulator memory firstAccumulation,
        AccumulationLibrary.PriceAccumulator memory secondAccumulation
    ) public pure virtual returns (uint256 price);
}
