// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../interfaces/IHistoricalOracle.sol";

contract MockHistoricalOracle is IHistoricalOracle {
    mapping(address => ObservationLibrary.Observation[]) observations;

    function getObservationAt(
        address token,
        uint256 index
    ) external view override returns (ObservationLibrary.Observation memory) {
        return observations[token][index];
    }

    function getObservations(
        address token,
        uint256 amount
    ) external view override returns (ObservationLibrary.Observation[] memory) {
        ObservationLibrary.Observation[] memory observations_ = observations[token];

        for (uint256 i = 0; i < amount; ++i) {
            observations_[i] = observations[token][i];
        }

        return observations_;
    }

    function getObservations(
        address token,
        uint256 amount,
        uint256 offset,
        uint256 increment
    ) external view override returns (ObservationLibrary.Observation[] memory) {
        ObservationLibrary.Observation[] memory observations_ = observations[token];

        for (uint256 i = 0; i < amount; ++i) {
            observations_[i] = observations[token][offset + i * increment];
        }

        return observations_;
    }

    function getObservationsCount(address token) external view override returns (uint256) {
        return observations[token].length;
    }

    function getObservationsCapacity(address token) external view override returns (uint256) {
        return observations[token].length;
    }

    function setObservationsCapacity(address, uint256) external pure override {
        revert("Not implemented");
    }

    /// @notice Sets the observations for a token.
    /// @param token The token to set the observations for.
    /// @param observations_ The observations to set, in reverse chronological order.
    function stubSetObservations(address token, ObservationLibrary.Observation[] memory observations_) public {
        ObservationLibrary.Observation[] storage stored = observations[token];
        require(stored.length == 0, "Observations already set");
        for (uint256 i = 0; i < observations_.length; ++i) {
            stored.push(observations_[i]);
        }
    }
}
