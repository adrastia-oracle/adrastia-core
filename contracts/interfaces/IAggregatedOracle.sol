//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

import "./IOracle.sol";

abstract contract IAggregatedOracle is IOracle {
    event UpdateErrorWithReason(address indexed token, string reason);

    event UpdateError(address indexed token, bytes err);

    event ConsultErrorWithReason(address indexed token, string reason);

    event ConsultError(address indexed token, bytes err);

    function getOracles() external view virtual returns (address[] memory);
}
