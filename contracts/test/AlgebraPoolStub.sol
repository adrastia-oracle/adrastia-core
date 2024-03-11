//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

interface IAlgebraPoolState {
    /**
     * @notice The currently in range liquidity available to the pool
     * @dev This value has no relationship to the total liquidity across all ticks.
     * Returned value cannot exceed type(uint128).max
     */
    function liquidity() external view returns (uint128);

    function globalState()
        external
        view
        returns (
            uint160 price,
            int24 tick,
            uint16 fee,
            uint16 timepointIndex,
            uint8 communityFeeToken0,
            uint8 communityFeeToken1,
            bool unlocked
        );
}

contract AlgebraPoolStub is IAlgebraPoolState {
    uint160 public price;
    int24 public tick;
    uint16 public fee;
    uint16 public timepointIndex;
    uint8 public communityFeeToken0;
    uint8 public communityFeeToken1;
    bool public unlocked;

    bool public globalStateRevert;

    uint128 public _liquidity;

    function liquidity() external view override returns (uint128) {
        return _liquidity;
    }

    function globalState() external view override returns (uint160, int24, uint16, uint16, uint8, uint8, bool) {
        if (globalStateRevert) {
            revert("AlgebraPoolStub: GLOBAL_STATE_REVERT");
        }

        return (price, tick, fee, timepointIndex, communityFeeToken0, communityFeeToken1, unlocked);
    }

    function setLiquidity(uint128 liquidity_) public {
        _liquidity = liquidity_;
    }

    function setGlobalState(
        uint160 price_,
        int24 tick_,
        uint16 fee_,
        uint16 timepointIndex_,
        uint8 communityFeeToken0_,
        uint8 communityFeeToken1_,
        bool unlocked_
    ) public {
        price = price_;
        tick = tick_;
        fee = fee_;
        timepointIndex = timepointIndex_;
        communityFeeToken0 = communityFeeToken0_;
        communityFeeToken1 = communityFeeToken1_;
        unlocked = unlocked_;
    }

    function setGlobalStateRevert(bool globalStateRevert_) public {
        globalStateRevert = globalStateRevert_;
    }
}
