// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {IIonicCToken} from "../../../accumulators/proto/ionic/IonicSBAccumulator.sol";
import {ICToken} from "../../../accumulators/proto/compound/CompoundV2SBAccumulator.sol";

contract IonicCTokenStub is IIonicCToken, ICToken {
    uint256 public _totalUnderlyingSupplied;
    address public _underlying;

    uint256 public _totalBorrows;
    uint256 public _totalReserves;
    uint256 public _cash;

    bool internal _isCEther;

    constructor(address underlying_) {
        _underlying = underlying_;
    }

    function stubSetTotalUnderlyingSupplied(uint256 totalUnderlyingSupplied) external {
        _totalUnderlyingSupplied = totalUnderlyingSupplied;
    }

    function stubSetTotalBorrows(uint256 totalBorrows_) external {
        _totalBorrows = totalBorrows_;
    }

    function stubSetTotalReserves(uint256 totalReserves_) external {
        _totalReserves = totalReserves_;
    }

    function stubSetCash(uint256 cash_) external {
        _cash = cash_;
    }

    function stubSetIsCEther(bool isCEther_) external {
        _isCEther = isCEther_;
    }

    function getTotalUnderlyingSupplied() external view override returns (uint256) {
        return _totalUnderlyingSupplied;
    }

    function underlying() external view override returns (address) {
        if (_isCEther) {
            revert();
        }

        return _underlying;
    }

    function totalBorrows() external view override returns (uint256) {
        return _totalBorrows;
    }

    function totalReserves() external view override returns (uint256) {
        return _totalReserves;
    }

    function getCash() external view override returns (uint256) {
        return _cash;
    }
}
