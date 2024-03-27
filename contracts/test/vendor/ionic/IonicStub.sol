// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import {IIonicComptroller} from "../../../accumulators/proto/ionic/IonicSBAccumulator.sol";
import {IComptroller} from "../../../accumulators/proto/compound/CompoundV2SBAccumulator.sol";
import {ICToken} from "../../../accumulators/proto/compound/CompoundV2SBAccumulator.sol";

contract IonicStub is IIonicComptroller, IComptroller {
    mapping(address => address) public _cTokensByUnderlying;
    address[] public _allMarkets;

    function stubSetCToken(address underlying, address cToken) external {
        _cTokensByUnderlying[underlying] = cToken;

        stubAddMarket(cToken, false, false);
    }

    function stubAddMarket(address cToken) external {
        stubAddMarket(cToken, true, false);
    }

    function stubAddMarket(address cToken, bool revertAlreadyExists, bool allowDuplicates) public {
        if (!allowDuplicates) {
            for (uint256 i = 0; i < _allMarkets.length; i++) {
                if (revertAlreadyExists) {
                    require(_allMarkets[i] != cToken, "IonicStub: MARKET_ALREADY_ADDED");
                } else {
                    if (_allMarkets[i] == cToken) {
                        return;
                    }
                }
            }
        }

        _allMarkets.push(cToken);
    }

    function stubRemoveMarket(address cToken) external {
        address[] memory oldMarkets = _allMarkets;

        delete _allMarkets;

        for (uint256 i = 0; i < oldMarkets.length; i++) {
            if (oldMarkets[i] != cToken) {
                _allMarkets.push(oldMarkets[i]);
            }
        }

        address underlying = ICToken(cToken).underlying();
        _cTokensByUnderlying[underlying] = address(0);
    }

    function stubRemoveAllMarkets() external {
        address[] memory oldMarkets = _allMarkets;

        for (uint256 i = 0; i < oldMarkets.length; ++i) {
            address underlying = ICToken(oldMarkets[i]).underlying();
            _cTokensByUnderlying[underlying] = address(0);
        }

        delete _allMarkets;
    }

    function cTokensByUnderlying(address underlying) external view override returns (address) {
        return _cTokensByUnderlying[underlying];
    }

    function allMarkets(uint256 index) external view override returns (address) {
        return _allMarkets[index];
    }
}
