// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

library StringLibrary {
    function bytes32ToString(bytes32 self) internal pure returns (string memory) {
        // Calculate string length
        uint256 i = 0;
        while (i < 32 && self[i] != 0) ++i;

        bytes memory bytesArray = new bytes(i);

        // Extract characters
        for (i = 0; i < 32 && self[i] != 0; ++i) bytesArray[i] = self[i];

        return string(bytesArray);
    }
}
