// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {IIonicCToken} from "../../../accumulators/proto/ionic/IonicSBAccumulator.sol";
import {ICToken} from "../../../accumulators/proto/compound/CompoundV2SBAccumulator.sol";

contract CEtherStub {
    uint256 public _totalBorrows;
    uint256 public _totalReserves;
    uint256 public _cash;

    uint256 public _junk;

    bool public _revertInFallback;
    bool public _consumeGasInFallback;
    bool public _writeInFallback;

    constructor() {}

    function stubSetTotalBorrows(uint256 totalBorrows_) external {
        _totalBorrows = totalBorrows_;
    }

    function stubSetTotalReserves(uint256 totalReserves_) external {
        _totalReserves = totalReserves_;
    }

    function stubSetCash(uint256 cash_) external {
        _cash = cash_;
    }

    function stubSetRevertInFallback(bool revertInFallback_) external {
        _revertInFallback = revertInFallback_;
    }

    function stubSetConsumeGasInFallback(bool consumeGasInFallback_) external {
        _consumeGasInFallback = consumeGasInFallback_;
    }

    function stubSetWriteInFallback(bool writeInFallback_) external {
        _writeInFallback = writeInFallback_;
    }

    function totalBorrows() external view returns (uint256) {
        return _totalBorrows;
    }

    function totalReserves() external view returns (uint256) {
        return _totalReserves;
    }

    function getCash() external view returns (uint256) {
        return _cash;
    }

    fallback() external {
        if (_revertInFallback) {
            revert();
        }

        if (_consumeGasInFallback) {
            for (uint256 i = 0; i < type(uint256).max; ++i) {
                for (uint256 j = 0; j < type(uint256).max; ++j) {
                    keccak256(abi.encodePacked(i, j));
                }
            }
        }

        if (_writeInFallback) {
            _junk = block.number;
        }
    }
}
