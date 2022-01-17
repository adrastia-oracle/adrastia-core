// SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "../../oracles/AbstractOracle.sol";

contract MockOracle is AbstractOracle {
    mapping(bytes32 => uint256) public callCounts;

    bool _needsUpdate;
    bool _updateReturn;

    bool _consultError;
    bool _updateError;
    bool _updateErrorWithReason;

    constructor(address quoteToken_) AbstractOracle(quoteToken_) {}

    function stubSetObservation(
        address token,
        uint256 price,
        uint256 tokenLiquidity,
        uint256 quoteTokenLiquidity,
        uint256 timestamp
    ) public {
        ObservationLibrary.Observation storage observation = observations[token];

        observation.price = price;
        observation.tokenLiquidity = tokenLiquidity;
        observation.quoteTokenLiquidity = quoteTokenLiquidity;
        observation.timestamp = timestamp;
    }

    function stubSetNeedsUpdate(bool b) public {
        _needsUpdate = b;
    }

    function stubSetUpdateReturn(bool b) public {
        _updateReturn = b;
    }

    function stubSetConsultError(bool b) public {
        _consultError = b;
    }

    function stubSetUpdateError(bool b) public {
        _updateError = b;
    }

    function stubSetUpdateErrorWithReason(bool b) public {
        _updateErrorWithReason = b;
    }

    function consult(address token)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        if (_consultError) price = 2 * type(uint256).max;

        return super.consult(token);
    }

    function consult(address token, uint256 maxAge)
        public
        view
        virtual
        override
        returns (
            uint256 price,
            uint256 tokenLiquidity,
            uint256 quoteTokenLiquidity
        )
    {
        if (_consultError) price = 2 * type(uint256).max;

        return super.consult(token, maxAge);
    }

    function update(
        address /*token*/
    ) external virtual override returns (bool) {
        callCounts["update(address)"]++;

        if (_updateError) return 2 * type(uint256).max == 0;

        require(!_updateErrorWithReason, "REASON");

        return _updateReturn;
    }

    function needsUpdate(
        address /*token*/
    ) public view virtual override returns (bool) {
        return _needsUpdate;
    }
}
