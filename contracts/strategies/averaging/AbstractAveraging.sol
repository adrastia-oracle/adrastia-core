// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/utils/introspection/IERC165.sol";

import "./IAveragingStrategy.sol";

/**
 * @title AbstractAveraging
 * @notice An abstract contract for averaging strategies that implements ERC165.
 */
abstract contract AbstractAveraging is IERC165, IAveragingStrategy {
    // @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAveragingStrategy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
