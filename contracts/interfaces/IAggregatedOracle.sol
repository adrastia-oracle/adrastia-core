//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.9;

abstract contract IAggregatedOracle {

    function getOracles() virtual external view returns(address[] memory);

}
