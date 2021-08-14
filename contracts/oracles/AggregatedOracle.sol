//SPDX-License-Identifier: MIT
pragma solidity  >=0.5 <0.8;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../interfaces/IOracle.sol";
import "../interfaces/IAggregatedOracle.sol";
import "../interfaces/IDataSource.sol";

import "../libraries/ObservationLibrary.sol";

import "hardhat/console.sol";

contract AggregatedOracle is IOracle, IAggregatedOracle {

    using SafeMath for uint256;

    address[] public oracles;

    mapping(address => ObservationLibrary.Observation) public storedConsultations;

    constructor(address[] memory oracles_) {
        require(oracles_.length > 0, "AggregatedOracle: No oracles provided.");

        oracles = oracles_;
    }

    function getOracles() override virtual external view returns(address[] memory) {
        return oracles;
    }

    function needsUpdate(address token) override virtual public view returns(bool) {
        for (uint256 i = 0; i < oracles.length; ++i) {
            if (IOracle(oracles[i]).needsUpdate(token))
                return true;
        }

        return false;
    }

    function update(address token) override external {
        for (uint256 i = 0; i < oracles.length; ++i)
            IOracle(oracles[i]).update(token);

        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        (consultation.price, consultation.tokenLiquidity, consultation.baseLiquidity) = consultFresh(token);
        consultation.timestamp = block.timestamp;
    }

    function consult(address token) override virtual public view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        ObservationLibrary.Observation storage consultation = storedConsultations[token];

        price = consultation.price;
        tokenLiquidity = consultation.tokenLiquidity;
        baseLiquidity = consultation.baseLiquidity;
    }

    function consultFresh(address token) override virtual public view
        returns (uint256 price, uint256 tokenLiquidity, uint256 baseLiquidity)
    {
        require(oracles.length > 0, "No underlying oracles.");

        uint oracleCount = oracles.length;

        uint256 oraclePrice;
        uint256 oracleTokenLiquidity;
        uint256 oracleBaseLiquidity;

        for (uint256 i = 0; i < oracleCount; ++i) {
            (oraclePrice, oracleTokenLiquidity, oracleBaseLiquidity) = IOracle(oracles[i]).consult(token);

            price = price.add(oraclePrice.mul(oracleBaseLiquidity));

            tokenLiquidity = tokenLiquidity.add(oracleTokenLiquidity);
            baseLiquidity = baseLiquidity.add(oracleBaseLiquidity);
        }

        price = baseLiquidity == 0 ? 0 : price.div(baseLiquidity);
    }

}
