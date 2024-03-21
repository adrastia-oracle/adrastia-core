// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../LiquidityAccumulator.sol";
import "../../../libraries/SafeCastExt.sol";

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

    uint8 internal immutable _liquidityDecimals;
    uint256 internal immutable _decimalFactor;

    /// @notice Emitted when an unsupported token is encountered.
    error InvalidToken(address token);

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

        refreshTokenMappings();
    }

    function quoteTokenDecimals() public view virtual override(SimpleQuotationMetadata, IQuoteToken) returns (uint8) {
        return _liquidityDecimals;
    }

    function liquidityDecimals() public view virtual override returns (uint8) {
        return _liquidityDecimals;
    }

    function refreshTokenMappings() public virtual {
        // Delete old mappings
        for (uint256 i = 0; i < _cTokens.length; ++i) {
            delete _tokenToCToken[_cTokens[i]];
        }
        delete _cTokens;

        for (uint256 i = 0; i < 256; ++i) {
            (bool success1, bytes memory data1) = address(comptroller).staticcall(
                abi.encodeWithSelector(IComptroller.allMarkets.selector, i)
            );
            if (success1) {
                address cToken = abi.decode(data1, (address));

                // Now get the underlying token
                (bool success2, bytes memory data2) = cToken.staticcall(
                    abi.encodeWithSelector(ICToken.underlying.selector)
                );
                if (success2) {
                    address token = abi.decode(data2, (address));
                    uint8 tokenDecimals = IERC20Metadata(token).decimals();
                    _cTokens.push(cToken);
                    _tokenToCToken[token] = TokenInfo({cToken: ICToken(cToken), underlyingDecimals: tokenDecimals});
                }
                // Note: cTokens like cEther don't have an underlying token. Such tokens will be ignored.
            } else {
                // We've iterated through all markets
                break;
            }
        }
    }

    function tokenInfo(address token) public view virtual returns (ICToken cToken, uint8 underlyingDecimals) {
        TokenInfo memory info = _tokenToCToken[token];

        cToken = info.cToken;
        underlyingDecimals = info.underlyingDecimals;
    }

    function supplyForCToken(ICToken cToken) internal view virtual returns (uint256) {
        uint256 cash = cToken.getCash();
        uint256 totalReserves = cToken.totalReserves();
        uint256 totalBorrows = cToken.totalBorrows();

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
