//SPDX-License-Identifier: MIT
pragma solidity >=0.5.0 <0.9.0;

abstract contract IUpdateByToken {
    function needsUpdate(address token) public view virtual returns (bool);

    function update(address token) external virtual returns (bool);
}
