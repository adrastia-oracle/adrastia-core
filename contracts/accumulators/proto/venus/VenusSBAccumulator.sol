// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../compound/CompoundV2SBAccumulator.sol";

interface VToken {
    function badDebt() external view returns (uint256);
}

/**
 * @title VenusSBAccumulator - Venus Supply & Borrow Accumulator
 * @author Tyler Loewen, TRILEZ SOFTWARE INC. dba. Adrastia
 * @notice A Supply & Borrow Accumulator for the Venus protocol, extending the CompoundV2SBAccumulator.
 * @dev This contract is made for vTokens that implement the `badDebt` function.
 */
contract VenusSBAccumulator is CompoundV2SBAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address comptroller_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        CompoundV2SBAccumulator(
            averagingStrategy_,
            comptroller_,
            decimals_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function borrowsForCToken(ICToken cToken) internal view virtual override returns (uint256) {
        uint256 totalBorrows = super.borrowsForCToken(cToken);

        return totalBorrows + VToken(address(cToken)).badDebt();
    }
}
