//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

abstract contract IAggregatedOracle {
    function getOracles() external view virtual returns (address[] memory);
}
