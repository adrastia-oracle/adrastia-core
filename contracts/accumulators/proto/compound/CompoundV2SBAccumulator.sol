// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../LiquidityAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";
import "../../../libraries/EtherAsTokenLibrary.sol";

interface IComptroller {
    function allMarkets(uint256 index) external view returns (address);
}

interface ICToken {
    function underlying() external view returns (address);

    function totalBorrows() external view returns (uint256);

    function totalReserves() external view returns (uint256);

    function getCash() external view returns (uint256);
}

contract CompoundV2SBAccumulator is LiquidityAccumulator {
    using SafeCastExt for uint256;

    struct TokenInfo {
        ICToken cToken;
        uint8 underlyingDecimals;
    }

    address public immutable comptroller;

    address[] internal _cTokens;
    mapping(address => TokenInfo) internal _tokenToCToken;
    mapping(address => address) internal _cTokenToToken;

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;

    /**
     * @notice Emitted when the token mappings are refreshed.
     * @param numAdded The number of tokens added.
     * @param numRemoved The number of tokens removed.
     */
    event TokenMappingsRefreshed(uint256 numAdded, uint256 numRemoved);

    /**
     * @notice Emitted when a new cToken is added to the mapping.
     * @param cToken The cToken address.
     */
    event CTokenAdded(address indexed cToken);

    /**
     * @notice Emitted when a cToken is removed from the mapping.
     * @param cToken The cToken address.
     */
    event CTokenRemoved(address indexed cToken);

    /// @notice Emitted when an unsupported token is encountered.
    error InvalidToken(address token);

    /// @notice Emitted when a token is already mapped to a cToken.
    /// @param token The token address.
    /// @param cToken The cToken address.
    error DuplicateMarket(address token, address cToken);

    constructor(
        IAveragingStrategy averagingStrategy_,
        address comptroller_,
        uint8 decimals_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    ) LiquidityAccumulator(averagingStrategy_, address(0), updateTheshold_, minUpdateDelay_, maxUpdateDelay_) {
        comptroller = comptroller_;

        _liquidityDecimals = decimals_;
        _decimalFactor = 10 ** decimals_;

        _refreshTokenMappings();
    }

    function refreshTokenMappings() external virtual {
        _refreshTokenMappings();
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    /// @dev Calls to the cToken contracts are limited to 20k gas to avoid issues with CEther fallback.
    function _refreshTokenMappings() internal virtual {
        address[] memory oldCTokens = _cTokens;

        // Delete old mappings
        for (uint256 i = 0; i < oldCTokens.length; ++i) {
            address token = _cTokenToToken[oldCTokens[i]];
            delete _tokenToCToken[token];
            delete _cTokenToToken[oldCTokens[i]];
        }
        delete _cTokens;

        uint256 numTokens = 0;
        for (uint256 i = 0; i < 256; ++i) {
            (bool success1, bytes memory data1) = address(comptroller).staticcall(
                abi.encodeWithSelector(IComptroller.allMarkets.selector, i)
            );
            if (success1 && data1.length == 32) {
                address cToken = abi.decode(data1, (address));
                if (cToken == address(0)) {
                    // Skip past any empty markets (this should never happen, but just in case)
                    continue;
                }

                // Now get the underlying token
                (bool success2, bytes memory data2) = cToken.staticcall{gas: 20000}(
                    abi.encodeWithSelector(ICToken.underlying.selector)
                );
                address token;
                uint8 tokenDecimals;
                if (success2 && data2.length == 32) {
                    // CErc20
                    token = abi.decode(data2, (address));
                    tokenDecimals = IERC20Metadata(token).decimals();
                } else {
                    // CEther
                    token = EtherAsTokenLibrary.ETHER_AS_TOKEN;
                    tokenDecimals = 18;
                }

                if (address(_tokenToCToken[token].cToken) != address(0)) {
                    revert DuplicateMarket(token, cToken);
                }

                _cTokens.push(cToken);
                _tokenToCToken[token] = TokenInfo({cToken: ICToken(cToken), underlyingDecimals: tokenDecimals});
                _cTokenToToken[cToken] = token;
                ++numTokens;
            } else {
                // We've iterated through all markets
                break;
            }
        }

        // Log the removals
        uint256 numRemoved = 0;
        for (uint256 i = 0; i < oldCTokens.length; ++i) {
            if (address(_cTokenToToken[oldCTokens[i]]) == address(0)) {
                emit CTokenRemoved(oldCTokens[i]);
                ++numRemoved;
            }
        }

        // Log the additions
        uint256 numAdded = 0;
        address[] memory newCTokens = _cTokens;
        for (uint256 i = 0; i < newCTokens.length; ++i) {
            bool isNew = true;

            for (uint256 j = 0; j < oldCTokens.length; ++j) {
                if (oldCTokens[j] == newCTokens[i]) {
                    isNew = false;
                    break;
                }
            }

            if (isNew) {
                emit CTokenAdded(newCTokens[i]);
                ++numAdded;
            }
        }

        emit TokenMappingsRefreshed(numAdded, numRemoved);
    }

    function tokenInfo(address token) public view virtual returns (ICToken cToken, uint8 underlyingDecimals) {
        TokenInfo memory info = _tokenToCToken[token];

        cToken = info.cToken;
        underlyingDecimals = info.underlyingDecimals;
    }

    function supplyForCToken(ICToken cToken) internal view virtual returns (uint256) {
        uint256 cash = cToken.getCash();
        uint256 totalReserves = cToken.totalReserves();
        uint256 totalBorrows = borrowsForCToken(cToken);

        return (cash + totalBorrows) - totalReserves;
    }

    function borrowsForCToken(ICToken cToken) internal view virtual returns (uint256) {
        return cToken.totalBorrows();
    }

    function fetchLiquidity(
        bytes memory data
    ) internal view virtual override returns (uint112 tokenLiquidity, uint112 quoteTokenLiquidity) {
        address token = abi.decode(data, (address));
        (ICToken cToken, uint8 decimals) = tokenInfo(token);
        if (address(cToken) == address(0)) {
            revert InvalidToken(token);
        }

        uint256 tokenDecimalsFactor = 10 ** decimals;

        uint256 totalSupply = (supplyForCToken(cToken) * _decimalFactor) / tokenDecimalsFactor;
        uint256 totalBorrow = (borrowsForCToken(cToken) * _decimalFactor) / tokenDecimalsFactor;

        tokenLiquidity = totalBorrow.toUint112();
        quoteTokenLiquidity = totalSupply.toUint112();
    }
}
