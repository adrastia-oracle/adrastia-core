// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import {IVault} from "../accumulators/proto/balancer/BalancerV2WeightedPriceAccumulator.sol";

contract BalancerVaultStub is IVault {
    uint256 internal constant MAX_TOKENS = 8;

    struct Pool {
        address poolAddress;
        uint8 numTokens;
        address[MAX_TOKENS] tokens;
        uint256[MAX_TOKENS] balances;
        uint256 lastChangeBlock;
    }

    mapping(bytes32 => Pool) public pools;

    function getPoolTokens(
        bytes32 poolId
    ) external view returns (address[] memory tokens, uint256[] memory balances, uint256 lastChangeBlock) {
        Pool memory pool = pools[poolId];

        tokens = new address[](pool.numTokens);
        balances = new uint256[](pool.numTokens);

        for (uint256 i = 0; i < pool.numTokens; i++) {
            tokens[i] = pool.tokens[i];
            balances[i] = pool.balances[i];
        }

        lastChangeBlock = pool.lastChangeBlock;
    }

    function getPool(bytes32 poolId) external view returns (address poolAddress, uint8 numTokens) {
        Pool memory pool = pools[poolId];

        poolAddress = pool.poolAddress;
        numTokens = pool.numTokens;
    }

    function stubRegisterPool(bytes32 poolId, address poolAddress, address[] memory tokens) external {
        Pool storage pool = pools[poolId];

        require(pool.poolAddress == address(0), "Pool already registered");

        pool.poolAddress = poolAddress;
        pool.numTokens = uint8(tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            pool.tokens[i] = tokens[i];
        }

        pool.lastChangeBlock = block.number;
    }

    function stubSetBalances(bytes32 poolId, uint256[] memory balances) external {
        Pool storage pool = pools[poolId];

        for (uint256 i = 0; i < balances.length; i++) {
            pool.balances[i] = balances[i];
        }

        pool.lastChangeBlock = block.number;
    }

    function stubSetBalance(bytes32 poolId, address token, uint256 balance) external {
        Pool storage pool = pools[poolId];

        for (uint256 i = 0; i < pool.numTokens; i++) {
            if (pool.tokens[i] == token) {
                pool.balances[i] = balance;
                pool.lastChangeBlock = block.number;

                return;
            }
        }

        revert("Token not found");
    }
}
