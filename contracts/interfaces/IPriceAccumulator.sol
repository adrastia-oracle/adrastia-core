//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

pragma experimental ABIEncoderV2;

import "./IUpdateByToken.sol";

import "../libraries/AccumulationLibrary.sol";
import "../libraries/ObservationLibrary.sol";

abstract contract IPriceAccumulator is IUpdateByToken {
    function quoteToken() external view virtual returns (address);

    function changePrecision() external view virtual returns (uint256);

    function calculatePrice(
        AccumulationLibrary.PriceAccumulator calldata firstAccumulation,
        AccumulationLibrary.PriceAccumulator calldata secondAccumulation
    ) external pure virtual returns (uint256 price);

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
}
