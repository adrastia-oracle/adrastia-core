// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title Provides functions for deriving a pool address from the factory, tokens, and the fee
library PoolAddress {
    bytes32 internal constant POOL_INIT_CODE_HASH = 0x6ec6c9c8091d160c0aa74b2b14ba9c1717e95093bd3ac085cee99a49aab294a4;

    function computeAddress(
        address poolDeployer,
        bytes32 initCodeHash,
        address token0,
        address token1
    ) internal pure returns (address pool) {
        if (token0 > token1) {
            // Sort tokens so that the first token is the one with the lower address
            (token0, token1) = (token1, token0);
        }

        pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(hex"ff", poolDeployer, keccak256(abi.encode(token0, token1)), initCodeHash)
                    )
                )
            )
        );
    }
}
