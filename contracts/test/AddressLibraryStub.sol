// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../libraries/AddressLibrary.sol";

contract AddressLibraryStub {
    using AddressLibrary for address;

    function stubIsContract(address a) external view returns (bool) {
        return a.isContract();
    }
}
