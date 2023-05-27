const { ethers } = require("hardhat");
const { Decimal } = require("decimal.js");
const { expect } = require("chai");

const BigNumber = ethers.BigNumber;

const MAX_RELATIVE_ERROR = 0.0001; // Max relative error
const SCALING_FACTOR = 1e18;

function random(min, max) {
    return Math.random() * (max - min) + min;
}

const decimal = (x) => new Decimal(x.toString());

const pct = (x, pct) => bn(decimal(x).mul(decimal(pct)));

function parseScientific(num) {
    // If the number is not in scientific notation return it as it is
    if (!/\d+\.?\d*e[+-]*\d+/i.test(num)) return num;

    // Remove the sign
    const numberSign = Math.sign(Number(num));
    num = Math.abs(Number(num)).toString();

    // Parse into coefficient and exponent
    const [coefficient, exponent] = num.toLowerCase().split("e");
    let zeros = Math.abs(Number(exponent));
    const exponentSign = Math.sign(Number(exponent));
    const [integer, decimals] = (coefficient.indexOf(".") != -1 ? coefficient : `${coefficient}.`).split(".");

    if (exponentSign === -1) {
        zeros -= integer.length;
        num =
            zeros < 0
                ? integer.slice(0, zeros) + "." + integer.slice(zeros) + decimals
                : "0." + "0".repeat(zeros) + integer + decimals;
    } else {
        if (decimals) zeros -= decimals.length;
        num =
            zeros < 0
                ? integer + decimals.slice(0, zeros) + "." + decimals.slice(zeros)
                : integer + decimals + "0".repeat(zeros);
    }

    return numberSign < 0 ? "-" + num : num;
}

const bn = (x) => {
    if (BigNumber.isBigNumber(x)) return x;
    const stringified = parseScientific(x.toString());
    const integer = stringified.split(".")[0];
    return BigNumber.from(integer);
};

const toFp = (x) => decimal(x).mul(SCALING_FACTOR);

const fromFp = (x) => decimal(x).div(SCALING_FACTOR);

const fp = (x) => bn(toFp(x));

function expectEqualWithError(actual, expected, error = 0.001) {
    actual = bn(actual);
    expected = bn(expected);
    const acceptedError = pct(expected, error);

    if (actual.gte(0)) {
        expect(actual).to.be.at.least(expected.sub(acceptedError));
        expect(actual).to.be.at.most(expected.add(acceptedError));
    } else {
        expect(actual).to.be.at.most(expected.sub(acceptedError));
        expect(actual).to.be.at.least(expected.add(acceptedError));
    }
}

function calculateInvariant(fpRawBalances, amplificationParameter) {
    return calculateApproxInvariant(fpRawBalances, amplificationParameter);
}

function calculateApproxInvariant(fpRawBalances, amplificationParameter) {
    const totalCoins = fpRawBalances.length;
    const balances = fpRawBalances.map(fromFp);

    const sum = balances.reduce((a, b) => a.add(b), decimal(0));

    if (sum.isZero()) {
        return bn(0);
    }

    let inv = sum;
    let prevInv = decimal(0);
    const ampTimesTotal = decimal(amplificationParameter).mul(totalCoins);

    for (let i = 0; i < 255; i++) {
        let P_D = balances[0].mul(totalCoins);
        for (let j = 1; j < totalCoins; j++) {
            P_D = P_D.mul(balances[j]).mul(totalCoins).div(inv);
        }

        prevInv = inv;
        inv = decimal(totalCoins)
            .mul(inv)
            .mul(inv)
            .add(ampTimesTotal.mul(sum).mul(P_D))
            .div(decimal(totalCoins).add(1).mul(inv).add(ampTimesTotal.sub(1).mul(P_D)));

        // converge with precision of integer 1
        if (inv.gt(prevInv)) {
            if (fp(inv).sub(fp(prevInv)).lte(1)) {
                break;
            }
        } else if (fp(prevInv).sub(fp(inv)).lte(1)) {
            break;
        }
    }

    return fp(inv);
}

function calculateAnalyticalInvariantForTwoTokens(fpRawBalances, amplificationParameter) {
    if (fpRawBalances.length !== 2) {
        throw "Analytical invariant is solved only for 2 balances";
    }

    const sum = fpRawBalances.reduce((a, b) => a.add(fromFp(b)), decimal(0));
    const prod = fpRawBalances.reduce((a, b) => a.mul(fromFp(b)), decimal(1));

    // The amplification parameter equals to: A n^(n-1), where A is the amplification coefficient
    const amplificationCoefficient = decimal(amplificationParameter).div(2);

    //Q
    const q = amplificationCoefficient.mul(-16).mul(sum).mul(prod);

    //P
    const p = amplificationCoefficient.minus(decimal(1).div(4)).mul(16).mul(prod);

    //C
    const c = q
        .pow(2)
        .div(4)
        .add(p.pow(3).div(27))
        .pow(1 / 2)
        .minus(q.div(2))
        .pow(1 / 3);

    const invariant = c.minus(p.div(c.mul(3)));
    return fp(invariant);
}

function calcOutGivenIn(fpBalances, amplificationParameter, tokenIndexIn, tokenIndexOut, fpTokenAmountIn) {
    const invariant = fromFp(calculateInvariant(fpBalances, amplificationParameter));

    const balances = fpBalances.map(fromFp);
    balances[tokenIndexIn] = balances[tokenIndexIn].add(fromFp(fpTokenAmountIn));

    const finalBalanceOut = _getTokenBalanceGivenInvariantAndAllOtherBalances(
        balances,
        decimal(amplificationParameter),
        invariant,
        tokenIndexOut
    );

    return toFp(balances[tokenIndexOut].sub(finalBalanceOut));
}

function calcInGivenOut(fpBalances, amplificationParameter, tokenIndexIn, tokenIndexOut, fpTokenAmountOut) {
    const invariant = fromFp(calculateInvariant(fpBalances, amplificationParameter));

    const balances = fpBalances.map(fromFp);
    balances[tokenIndexOut] = balances[tokenIndexOut].sub(fromFp(fpTokenAmountOut));

    const finalBalanceIn = _getTokenBalanceGivenInvariantAndAllOtherBalances(
        balances,
        decimal(amplificationParameter),
        invariant,
        tokenIndexIn
    );

    return toFp(finalBalanceIn.sub(balances[tokenIndexIn]));
}

function calcBptOutGivenExactTokensIn(
    fpBalances,
    amplificationParameter,
    fpAmountsIn,
    fpBptTotalSupply,
    fpCurrentInvariant,
    fpSwapFeePercentage
) {
    // Get current invariant
    const currentInvariant = fromFp(fpCurrentInvariant);

    const balances = fpBalances.map(fromFp);
    const amountsIn = fpAmountsIn.map(fromFp);

    // First calculate the sum of all token balances which will be used to calculate
    // the current weights of each token relative to the sum of all balances
    const sumBalances = balances.reduce((a, b) => a.add(b), decimal(0));

    // Calculate the weighted balance ratio without considering fees
    const balanceRatiosWithFee = [];
    // The weighted sum of token balance rations sans fee
    let invariantRatioWithFees = decimal(0);
    for (let i = 0; i < balances.length; i++) {
        const currentWeight = balances[i].div(sumBalances);
        balanceRatiosWithFee[i] = balances[i].add(amountsIn[i]).div(balances[i]);
        invariantRatioWithFees = invariantRatioWithFees.add(balanceRatiosWithFee[i].mul(currentWeight));
    }

    // Second loop to calculate new amounts in taking into account the fee on the % excess
    for (let i = 0; i < balances.length; i++) {
        let amountInWithoutFee;

        // Check if the balance ratio is greater than the ideal ratio to charge fees or not
        if (balanceRatiosWithFee[i].gt(invariantRatioWithFees)) {
            const nonTaxableAmount = balances[i].mul(invariantRatioWithFees.sub(1));
            const taxableAmount = amountsIn[i].sub(nonTaxableAmount);
            amountInWithoutFee = nonTaxableAmount.add(taxableAmount.mul(decimal(1).sub(fromFp(fpSwapFeePercentage))));
        } else {
            amountInWithoutFee = amountsIn[i];
        }

        balances[i] = balances[i].add(amountInWithoutFee);
    }

    // Calculate the new invariant, taking swap fees into account
    const newInvariant = fromFp(calculateInvariant(balances.map(fp), amplificationParameter));
    const invariantRatio = newInvariant.div(currentInvariant);

    if (invariantRatio.gt(1)) {
        return fp(fromFp(fpBptTotalSupply).mul(invariantRatio.sub(1)));
    } else {
        return bn(0);
    }
}

function calcTokenInGivenExactBptOut(
    tokenIndex,
    fpBalances,
    amplificationParameter,
    fpBptAmountOut,
    fpBptTotalSupply,
    fpCurrentInvariant,
    fpSwapFeePercentage
) {
    // Calculate new invariant
    const newInvariant = fromFp(bn(fpBptTotalSupply).add(fpBptAmountOut))
        .div(fromFp(fpBptTotalSupply))
        .mul(fromFp(fpCurrentInvariant));

    // First calculate the sum of all token balances which will be used to calculate
    // the current weight of token
    const balances = fpBalances.map(fromFp);
    const sumBalances = balances.reduce((a, b) => a.add(b), decimal(0));

    // Calculate amount in without fee.
    const newBalanceTokenIndex = _getTokenBalanceGivenInvariantAndAllOtherBalances(
        balances,
        amplificationParameter,
        newInvariant,
        tokenIndex
    );

    const amountInWithoutFee = newBalanceTokenIndex.sub(balances[tokenIndex]);

    // We can now compute how much extra balance is being deposited and used in virtual swaps, and charge swap fees
    // accordingly.
    const currentWeight = balances[tokenIndex].div(sumBalances);
    const taxablePercentage = currentWeight.gt(1) ? 0 : decimal(1).sub(currentWeight);
    const taxableAmount = amountInWithoutFee.mul(taxablePercentage);
    const nonTaxableAmount = amountInWithoutFee.sub(taxableAmount);

    const bptOut = nonTaxableAmount.add(taxableAmount.div(decimal(1).sub(fromFp(fpSwapFeePercentage))));

    return fp(bptOut);
}

function calcBptInGivenExactTokensOut(
    fpBalances,
    amplificationParameter,
    fpAmountsOut,
    fpBptTotalSupply,
    fpCurrentInvariant,
    fpSwapFeePercentage
) {
    // Get current invariant
    const currentInvariant = fromFp(fpCurrentInvariant);

    const balances = fpBalances.map(fromFp);
    const amountsOut = fpAmountsOut.map(fromFp);

    // First calculate the sum of all token balances which will be used to calculate
    // the current weight of token
    const sumBalances = balances.reduce((a, b) => a.add(b), decimal(0));

    // Calculate the weighted balance ratio without considering fees
    const balanceRatiosWithoutFee = [];
    let invariantRatioWithoutFees = decimal(0);
    for (let i = 0; i < balances.length; i++) {
        const currentWeight = balances[i].div(sumBalances);
        balanceRatiosWithoutFee[i] = balances[i].sub(amountsOut[i]).div(balances[i]);
        invariantRatioWithoutFees = invariantRatioWithoutFees.add(balanceRatiosWithoutFee[i].mul(currentWeight));
    }

    // Second loop to calculate new amounts in taking into account the fee on the % excess
    for (let i = 0; i < balances.length; i++) {
        // Swap fees are typically charged on 'token in', but there is no 'token in' here, so we apply it to
        // 'token out'. This results in slightly larger price impact.

        let amountOutWithFee;
        if (invariantRatioWithoutFees.gt(balanceRatiosWithoutFee[i])) {
            const invariantRatioComplement = invariantRatioWithoutFees.gt(1)
                ? decimal(0)
                : decimal(1).sub(invariantRatioWithoutFees);
            const nonTaxableAmount = balances[i].mul(invariantRatioComplement);
            const taxableAmount = amountsOut[i].sub(nonTaxableAmount);
            amountOutWithFee = nonTaxableAmount.add(taxableAmount.div(decimal(1).sub(fromFp(fpSwapFeePercentage))));
        } else {
            amountOutWithFee = amountsOut[i];
        }

        balances[i] = balances[i].sub(amountOutWithFee);
    }

    // get new invariant taking into account swap fees
    const newInvariant = fromFp(calculateInvariant(balances.map(fp), amplificationParameter));

    // return amountBPTIn
    const invariantRatio = newInvariant.div(currentInvariant);
    const invariantRatioComplement = invariantRatio.lt(1) ? decimal(1).sub(invariantRatio) : decimal(0);
    return fp(fromFp(fpBptTotalSupply).mul(invariantRatioComplement));
}

function calcTokenOutGivenExactBptIn(
    tokenIndex,
    fpBalances,
    amplificationParameter,
    fpBptAmountIn,
    fpBptTotalSupply,
    fpCurrentInvariant,
    fpSwapFeePercentage
) {
    // Calculate new invariant
    const newInvariant = fromFp(bn(fpBptTotalSupply).sub(fpBptAmountIn))
        .div(fromFp(fpBptTotalSupply))
        .mul(fromFp(fpCurrentInvariant));

    // First calculate the sum of all token balances which will be used to calculate
    // the current weight of token
    const balances = fpBalances.map(fromFp);
    const sumBalances = balances.reduce((a, b) => a.add(b), decimal(0));

    // get amountOutBeforeFee
    const newBalanceTokenIndex = _getTokenBalanceGivenInvariantAndAllOtherBalances(
        balances,
        amplificationParameter,
        newInvariant,
        tokenIndex
    );
    const amountOutWithoutFee = balances[tokenIndex].sub(newBalanceTokenIndex);

    // We can now compute how much excess balance is being withdrawn as a result of the virtual swaps, which result
    // in swap fees.
    const currentWeight = balances[tokenIndex].div(sumBalances);
    const taxablePercentage = currentWeight.gt(1) ? decimal(0) : decimal(1).sub(currentWeight);

    // Swap fees are typically charged on 'token in', but there is no 'token in' here, so we apply it
    // to 'token out'. This results in slightly larger price impact. Fees are rounded up.
    const taxableAmount = amountOutWithoutFee.mul(taxablePercentage);
    const nonTaxableAmount = amountOutWithoutFee.sub(taxableAmount);
    const tokenOut = nonTaxableAmount.add(taxableAmount.mul(decimal(1).sub(fromFp(fpSwapFeePercentage))));
    return fp(tokenOut);
}

function calculateOneTokenSwapFeeAmount(fpBalances, amplificationParameter, lastInvariant, tokenIndex) {
    const balances = fpBalances.map(fromFp);

    const finalBalanceFeeToken = _getTokenBalanceGivenInvariantAndAllOtherBalances(
        balances,
        decimal(amplificationParameter),
        fromFp(lastInvariant),
        tokenIndex
    );

    if (finalBalanceFeeToken.gt(balances[tokenIndex])) {
        return decimal(0);
    }

    return toFp(balances[tokenIndex].sub(finalBalanceFeeToken));
}

// The amp factor input must be a number: *not* multiplied by the precision
function getTokenBalanceGivenInvariantAndAllOtherBalances(amp, fpBalances, fpInvariant, tokenIndex) {
    const invariant = fromFp(fpInvariant);
    const balances = fpBalances.map(fromFp);
    return fp(_getTokenBalanceGivenInvariantAndAllOtherBalances(balances, decimal(amp), invariant, tokenIndex));
}

function _getTokenBalanceGivenInvariantAndAllOtherBalances(balances, amplificationParameter, invariant, tokenIndex) {
    let sum = decimal(0);
    let mul = decimal(1);
    const numTokens = balances.length;

    for (let i = 0; i < numTokens; i++) {
        if (i != tokenIndex) {
            sum = sum.add(balances[i]);
            mul = mul.mul(balances[i]);
        }
    }

    // const a = 1;
    amplificationParameter = decimal(amplificationParameter);
    const b = invariant.div(amplificationParameter.mul(numTokens)).add(sum).sub(invariant);
    const c = invariant
        .pow(numTokens + 1)
        .mul(-1)
        .div(
            amplificationParameter.mul(
                decimal(numTokens)
                    .pow(numTokens + 1)
                    .mul(mul)
            )
        );

    return b
        .mul(-1)
        .add(b.pow(2).sub(c.mul(4)).squareRoot())
        .div(2);
}

// TODO: Test this math by checking extremes values for the amplification field (0 and infinite)
// to verify that it equals constant sum and constant product (weighted) invariants.

describe("StableMath", function () {
    var mock;

    const AMP_PRECISION = 1e3;

    before(async function () {
        const mockFactory = await ethers.getContractFactory("MockStableMath");
        mock = await mockFactory.deploy();
    });

    context("invariant", () => {
        async function checkInvariant(balances, amp) {
            const ampParameter = bn(amp).mul(AMP_PRECISION);

            const actualInvariant = await mock.invariant(ampParameter, balances);
            const expectedInvariant = calculateInvariant(balances, amp);

            expectEqualWithError(actualInvariant, expectedInvariant, MAX_RELATIVE_ERROR);
        }

        context("check over a range of inputs", () => {
            for (let numTokens = 2; numTokens <= 5; numTokens++) {
                const balances = Array.from({ length: numTokens }, () => random(250, 350)).map(fp);

                it(`computes the invariant for ${numTokens} tokens`, async () => {
                    for (let amp = 100; amp <= 5000; amp += 100) {
                        await checkInvariant(balances, amp);
                    }
                });
            }
        });

        context("two tokens", () => {
            it("invariant equals analytical solution", async () => {
                const amp = bn(100);
                const balances = [fp(10), fp(12)];

                const result = await mock.invariant(amp.mul(AMP_PRECISION), balances);
                const expectedInvariant = calculateAnalyticalInvariantForTwoTokens(balances, amp);

                expectEqualWithError(result, expectedInvariant, MAX_RELATIVE_ERROR);
            });
        });

        it("still converges at extreme values", async () => {
            const amp = bn(1);
            const balances = [fp(0.00000001), fp(1200000000), fp(300)];

            const result = await mock.invariant(amp.mul(AMP_PRECISION), balances);
            const expectedInvariant = calculateInvariant(balances, amp);

            expectEqualWithError(result, expectedInvariant, MAX_RELATIVE_ERROR);
        });
    });

    context("token balance given invariant and other balances", () => {
        async function checkTokenBalanceGivenInvariant(balances, invariant, amp, tokenIndex) {
            const ampParameter = bn(amp).mul(AMP_PRECISION);

            const actualTokenBalance = await mock.getTokenBalanceGivenInvariantAndAllOtherBalances(
                ampParameter,
                balances,
                invariant,
                tokenIndex
            );

            // Note this function takes the decimal amp (unadjusted)
            const expectedTokenBalance = getTokenBalanceGivenInvariantAndAllOtherBalances(
                amp,
                balances,
                invariant,
                tokenIndex
            );

            expectEqualWithError(actualTokenBalance, expectedTokenBalance, MAX_RELATIVE_ERROR);
        }

        context("check over a range of inputs", () => {
            for (let numTokens = 2; numTokens <= 5; numTokens++) {
                const balances = Array.from({ length: numTokens }, () => random(250, 350)).map(fp);

                it(`computes the token balance for ${numTokens} tokens`, async () => {
                    for (let amp = 100; amp <= 5000; amp += 100) {
                        const currentInvariant = calculateInvariant(balances, amp);

                        // mutate the balances
                        for (let tokenIndex = 0; tokenIndex < numTokens; tokenIndex++) {
                            const newBalances = Object.assign([], balances);
                            newBalances[tokenIndex] = newBalances[tokenIndex].add(fp(100));

                            await checkTokenBalanceGivenInvariant(newBalances, currentInvariant, amp, tokenIndex);
                        }
                    }
                });
            }
        });
    });

    context("in given out", () => {
        context("two tokens", () => {
            it("returns in given out", async () => {
                const amp = bn(100);
                const balances = Array.from({ length: 2 }, () => random(8, 12)).map(fp);
                const tokenIndexIn = 0;
                const tokenIndexOut = 1;
                const amountOut = fp(1);

                const result = await mock.inGivenOut(
                    amp.mul(AMP_PRECISION),
                    balances,
                    tokenIndexIn,
                    tokenIndexOut,
                    amountOut
                );
                const expectedAmountIn = calcInGivenOut(balances, amp, tokenIndexIn, tokenIndexOut, amountOut);

                expectEqualWithError(result, bn(expectedAmountIn.toFixed(0)), MAX_RELATIVE_ERROR);
            });
        });
        context("three tokens", () => {
            it("returns in given out", async () => {
                const amp = bn(100);
                const balances = Array.from({ length: 3 }, () => random(10, 14)).map(fp);
                const tokenIndexIn = 0;
                const tokenIndexOut = 1;
                const amountOut = fp(1);

                const result = await mock.inGivenOut(
                    amp.mul(AMP_PRECISION),
                    balances,
                    tokenIndexIn,
                    tokenIndexOut,
                    amountOut
                );
                const expectedAmountIn = calcInGivenOut(balances, amp, tokenIndexIn, tokenIndexOut, amountOut);

                expectEqualWithError(result, bn(expectedAmountIn.toFixed(0)), MAX_RELATIVE_ERROR);
            });
        });
    });

    context("out given in", () => {
        context("two tokens", () => {
            it("returns out given in", async () => {
                const amp = bn(10);
                const balances = Array.from({ length: 2 }, () => random(10, 12)).map(fp);
                const tokenIndexIn = 0;
                const tokenIndexOut = 1;
                const amountIn = fp(1);

                const result = await mock.outGivenIn(
                    amp.mul(AMP_PRECISION),
                    balances,
                    tokenIndexIn,
                    tokenIndexOut,
                    amountIn
                );
                const expectedAmountOut = calcOutGivenIn(balances, amp, tokenIndexIn, tokenIndexOut, amountIn);

                expectEqualWithError(result, bn(expectedAmountOut.toFixed(0)), MAX_RELATIVE_ERROR);
            });
        });
        context("three tokens", () => {
            it("returns out given in", async () => {
                const amp = bn(10);
                const balances = Array.from({ length: 3 }, () => random(10, 14)).map(fp);
                const tokenIndexIn = 0;
                const tokenIndexOut = 1;
                const amountIn = fp(1);

                const result = await mock.outGivenIn(
                    amp.mul(AMP_PRECISION),
                    balances,
                    tokenIndexIn,
                    tokenIndexOut,
                    amountIn
                );
                const expectedAmountOut = calcOutGivenIn(balances, amp, tokenIndexIn, tokenIndexOut, amountIn);

                expectEqualWithError(result, bn(expectedAmountOut.toFixed(0)), MAX_RELATIVE_ERROR);
            });
        });
    });

    context("BPT out given exact tokens in", () => {
        const SWAP_FEE = fp(0.022);

        async function checkBptOutGivenTokensIn(amp, balances, amountsIn, bptTotalSupply, swapFee) {
            const ampParameter = bn(amp).mul(AMP_PRECISION);
            const currentInvariant = calculateInvariant(balances, amp);

            const actualBptOut = await mock.exactTokensInForBPTOut(
                ampParameter,
                balances,
                amountsIn,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            const expectedBptOut = calcBptOutGivenExactTokensIn(
                balances,
                amp,
                amountsIn,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            expect(actualBptOut).gt(0);
            expectEqualWithError(actualBptOut, expectedBptOut, MAX_RELATIVE_ERROR);
        }

        context("check over a range of inputs", () => {
            for (let numTokens = 2; numTokens <= 5; numTokens++) {
                const balances = Array.from({ length: numTokens }, () => random(250, 350)).map(fp);
                const totalSupply = balances.reduce((sum, current) => {
                    return (sum = sum.add(current));
                });
                const amountsIn = Array.from({ length: numTokens }, () => random(0, 50)).map(fp);

                it(`computes the bptOut for ${numTokens} tokens`, async () => {
                    for (let amp = 100; amp <= 5000; amp += 100) {
                        await checkBptOutGivenTokensIn(amp, balances, amountsIn, totalSupply, SWAP_FEE);
                    }
                });
            }
        });
    });

    context("token in given exact BPT out", () => {
        const SWAP_FEE = fp(0.012);

        async function checkTokenInGivenBptOut(
            amp,
            balances,
            tokenIndex,
            bptAmountOut,
            bptTotalSupply,
            currentInvariant,
            swapFee
        ) {
            const ampParameter = bn(amp).mul(AMP_PRECISION);

            const actualTokenIn = await mock.tokenInForExactBPTOut(
                ampParameter,
                balances,
                tokenIndex,
                bptAmountOut,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            const expectedTokenIn = calcTokenInGivenExactBptOut(
                tokenIndex,
                balances,
                amp,
                bptAmountOut,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            expect(actualTokenIn).gt(0);
            expectEqualWithError(actualTokenIn, expectedTokenIn, MAX_RELATIVE_ERROR);
        }

        context("check over a range of inputs", () => {
            const bptAmountOut = fp(1);

            for (let numTokens = 2; numTokens <= 5; numTokens++) {
                const balances = Array.from({ length: numTokens }, () => random(250, 350)).map(fp);
                const totalSupply = balances.reduce((sum, current) => {
                    return (sum = sum.add(current));
                });

                it(`computes the token in for ${numTokens} tokens`, async () => {
                    for (let amp = 100; amp <= 5000; amp += 100) {
                        const currentInvariant = calculateInvariant(balances, amp);

                        for (let tokenIndex = 0; tokenIndex < numTokens; tokenIndex++) {
                            await checkTokenInGivenBptOut(
                                amp,
                                balances,
                                tokenIndex,
                                bptAmountOut,
                                totalSupply,
                                currentInvariant,
                                SWAP_FEE
                            );
                        }
                    }
                });
            }
        });
    });

    context("BPT in given exact tokens out", () => {
        const SWAP_FEE = fp(0.038);

        async function checkBptInGivenTokensOut(amp, balances, amountsOut, bptTotalSupply, currentInvariant, swapFee) {
            const ampParameter = bn(amp).mul(AMP_PRECISION);

            const actualBptIn = await mock.bptInForExactTokensOut(
                ampParameter,
                balances,
                amountsOut,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            const expectedBptIn = calcBptInGivenExactTokensOut(
                balances,
                amp,
                amountsOut,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            expect(actualBptIn).gt(0);
            expectEqualWithError(actualBptIn, expectedBptIn, MAX_RELATIVE_ERROR);
        }

        context("check over a range of inputs", () => {
            for (let numTokens = 2; numTokens <= 5; numTokens++) {
                const balances = Array.from({ length: numTokens }, () => random(250, 350)).map(fp);
                const totalSupply = balances.reduce((sum, current) => {
                    return (sum = sum.add(current));
                });
                const amountsOut = Array.from({ length: numTokens }, () => random(0, 50)).map(fp);

                it(`computes the bptOut for ${numTokens} tokens`, async () => {
                    for (let amp = 100; amp <= 5000; amp += 100) {
                        const currentInvariant = calculateInvariant(balances, amp);

                        await checkBptInGivenTokensOut(
                            amp,
                            balances,
                            amountsOut,
                            totalSupply,
                            currentInvariant,
                            SWAP_FEE
                        );
                    }
                });
            }
        });
    });

    context("token out given exact BPT in", () => {
        const SWAP_FEE = fp(0.012);

        async function checkTokenOutGivenBptIn(
            amp,
            balances,
            tokenIndex,
            bptAmountIn,
            bptTotalSupply,
            currentInvariant,
            swapFee
        ) {
            const ampParameter = bn(amp).mul(AMP_PRECISION);

            const actualTokenOut = await mock.exactBPTInForTokenOut(
                ampParameter,
                balances,
                tokenIndex,
                bptAmountIn,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            const expectedTokenOut = calcTokenOutGivenExactBptIn(
                tokenIndex,
                balances,
                amp,
                bptAmountIn,
                bptTotalSupply,
                currentInvariant,
                swapFee
            );

            expect(actualTokenOut).gt(0);
            expectEqualWithError(actualTokenOut, expectedTokenOut, MAX_RELATIVE_ERROR);
        }

        context("check over a range of inputs", () => {
            const bptAmountIn = fp(1);

            for (let numTokens = 2; numTokens <= 5; numTokens++) {
                const balances = Array.from({ length: numTokens }, () => random(250, 350)).map(fp);
                const totalSupply = balances.reduce((sum, current) => {
                    return (sum = sum.add(current));
                });

                it(`computes the token out for ${numTokens} tokens`, async () => {
                    for (let amp = 100; amp <= 5000; amp += 100) {
                        const currentInvariant = calculateInvariant(balances, amp);

                        for (let tokenIndex = 0; tokenIndex < numTokens; tokenIndex++) {
                            await checkTokenOutGivenBptIn(
                                amp,
                                balances,
                                tokenIndex,
                                bptAmountIn,
                                totalSupply,
                                currentInvariant,
                                SWAP_FEE
                            );
                        }
                    }
                });
            }
        });
    });
});
