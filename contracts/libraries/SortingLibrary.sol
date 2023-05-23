// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

library SortingLibrary {
    /**
     * @notice Sorts the array of numbers using the quick sort algorithm.
     *
     * @param self The array of numbers to sort.
     * @param left The left boundary of the sorting range.
     * @param right The right boundary of the sorting range.
     */
    function quickSort(uint112[] memory self, int256 left, int256 right) internal pure {
        if (right - left <= 10) {
            insertionSort(self, left, right);
            return;
        }

        int256 i = left;
        int256 j = right;

        // The following is commented out because it is not possible for i to be equal to j at this point.
        // if (i == j) return;

        uint256 pivotIndex = uint256(left + (right - left) / 2);
        uint256 pivotPrice = self[pivotIndex];

        while (i <= j) {
            while (self[uint256(i)] < pivotPrice) {
                i = i + 1;
            }
            while (pivotPrice < self[uint256(j)]) {
                j = j - 1;
            }
            if (i <= j) {
                (self[uint256(i)], self[uint256(j)]) = (self[uint256(j)], self[uint256(i)]);
                i = i + 1;
                j = j - 1;
            }
        }

        if (left < j) {
            quickSort(self, left, j);
        }
        if (i < right) {
            quickSort(self, i, right);
        }
    }

    /**
     * @notice Sorts the array of numbers using the insertion sort algorithm.
     *
     * @param self The array of numbers to sort.
     * @param left The left boundary of the sorting range.
     * @param right The right boundary of the sorting range.
     */
    function insertionSort(uint112[] memory self, int256 left, int256 right) internal pure {
        for (int256 i = left + 1; i <= right; i = i + 1) {
            uint112 key = self[uint256(i)];
            int256 j = i - 1;

            while (j >= left && self[uint256(j)] > key) {
                self[uint256(j + 1)] = self[uint256(j)];
                j = j - 1;
            }
            self[uint256(j + 1)] = key;
        }
    }
}
