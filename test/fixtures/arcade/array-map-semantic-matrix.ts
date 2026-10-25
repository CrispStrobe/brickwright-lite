// SPDX-License-Identifier: MIT
// Independently authored primitive Map semantic observation matrix.
// 1: primitive result and fresh identity.
let mmBasicInput = [1, 2];
let mmBasicResult = mmBasicInput.map(value => value + 10);
let mmBasicLength = mmBasicResult.length;
let mmBasic0 = mmBasicResult[0];
let mmBasic1 = mmBasicResult[1];
let mmBasicInput0 = mmBasicInput[0];
let mmBasicFresh = mmBasicResult !== mmBasicInput;
// 2: receiver evaluated once.
let mmReceiverCalls = 0;
function mmReceiver() { mmReceiverCalls++; return [2, 3]; }
let mmReceiverResult = mmReceiver().map(value => value * 2);
let mmReceiverLength = mmReceiverResult.length;
let mmReceiver0 = mmReceiverResult[0];
let mmReceiver1 = mmReceiverResult[1];
// 3: empty results are separately allocated.
let mmEmptyInput: number[] = [];
let mmEmptyA = mmEmptyInput.map(value => value + 1);
let mmEmptyB = mmEmptyInput.map(value => value + 1);
let mmEmptyOtherLength = mmEmptyB.length;
let mmEmptyLength = mmEmptyA.length;
let mmEmptyFreshInput = mmEmptyA !== mmEmptyInput;
let mmEmptyFreshOther = mmEmptyA !== mmEmptyB;
// 4: appended elements do not extend the original iteration range.
let mmAppendInput = [1, 2];
let mmAppendVisits = 0;
let mmAppendResult = mmAppendInput.map(value => {
    mmAppendVisits++;
    mmAppendInput.push(9);
    return value;
});
let mmAppendLength = mmAppendInput.length;
let mmAppendResultLength = mmAppendResult.length;
let mmAppendInput2 = mmAppendInput[2];
let mmAppendInput3 = mmAppendInput[3];
let mmAppend0 = mmAppendResult[0];
let mmAppend1 = mmAppendResult[1];
// 5: shrink still visits missing indices with actual Undefined.
let mmShrinkInput = [1, 2, 3];
let mmShrinkVisits = 0;
let mmShrinkMissingVisits = 0;
let mmShrinkResult = mmShrinkInput.map((value, index) => {
    mmShrinkVisits++;
    if (index === 0) { mmShrinkInput.pop(); mmShrinkInput.pop(); }
    if (value === undefined) mmShrinkMissingVisits++;
    return value;
});
let mmShrinkInputLength = mmShrinkInput.length;
let mmShrinkLength = mmShrinkResult.length;
let mmShrink0 = mmShrinkResult[0];
let mmShrinkU1 = mmShrinkResult[1] === undefined;
let mmShrinkU2 = mmShrinkResult[2] === undefined;
let mmShrinkType1 = typeof mmShrinkResult[1];
let mmShrinkString1 = typeof mmShrinkResult[1] === "string";
let mmShrinkNull1 = mmShrinkResult[1] === null;
// 6: reassigning the source binding does not replace the captured receiver.
let mmRebindInput = [1, 2];
let mmRebindOriginal = mmRebindInput;
let mmRebindResult = mmRebindInput.map((value, index) => {
    if (index === 0) mmRebindInput = [9];
    return value;
});
let mmRebindLength = mmRebindResult.length;
let mmRebindNowLength = mmRebindInput.length;
let mmRebindOriginalLength = mmRebindOriginal.length;
let mmRebindOriginal1 = mmRebindOriginal[1];
let mmRebind0 = mmRebindResult[0];
let mmRebind1 = mmRebindResult[1];
let mmRebindNow0 = mmRebindInput[0];
let mmRebindOriginal0 = mmRebindOriginal[0];
let mmRebindChangedBinding = mmRebindInput !== mmRebindOriginal;
// 7: a future indexed replacement is visible when that index is visited.
let mmFutureInput = [1, 2, 3];
let mmFutureResult = mmFutureInput.map((value, index) => {
    if (index === 0) mmFutureInput[1] = 7;
    return value;
});
let mmFutureLength = mmFutureResult.length;
let mmFuture0 = mmFutureResult[0];
let mmFuture1 = mmFutureResult[1];
let mmFuture2 = mmFutureResult[2];
// 8: actual callback value/index order.
let mmOrderTrace = 0;
let mmOrderResult = [3, 4].map((value, index) => {
    mmOrderTrace = mmOrderTrace * 100 + value * 10 + index;
    return index;
});
let mmOrderLength = mmOrderResult.length;
let mmOrder0 = mmOrderResult[0];
let mmOrder1 = mmOrderResult[1];
// 9: result aliases share mutations; the input is distinct.
let mmAliasInput = [1, 2];
let mmAliasResult = mmAliasInput.map(value => value);
let mmAlias = mmAliasResult;
mmAlias[0] = 8;
let mmAliasLength = mmAliasResult.length;
let mmAliasInput1 = mmAliasInput[1];
let mmAliasSame = mmAlias === mmAliasResult;
let mmAlias0 = mmAliasResult[0];
let mmAliasInput0 = mmAliasInput[0];
// 10: Boolean to Number and Number to Boolean primitive results.
let mmBoolInput = [true, false, true];
let mmBoolToNumber = mmBoolInput.map((value, index) => value ? index + 1 : 0);
let mmBNLength = mmBoolToNumber.length;
let mmBN0 = mmBoolToNumber[0];
let mmBN1 = mmBoolToNumber[1];
let mmBN2 = mmBoolToNumber[2];
let mmNumberToBool = [0, 2, 3].map(value => value > 1);
let mmNBLength = mmNumberToBool.length;
let mmNB0 = mmNumberToBool[0];
let mmNB1 = mmNumberToBool[1];
let mmNB2 = mmNumberToBool[2];
// 11: nested Map, while each callback result remains a Number.
let mmNestedCalls = 0;
let mmNestedResult = [1, 2].map(outer => {
    let innerResult = [3, 4].map(inner => { mmNestedCalls++; return inner + outer; });
    return innerResult[0] + innerResult[1];
});
let mmNestedLength = mmNestedResult.length;
let mmNested0 = mmNestedResult[0];
let mmNested1 = mmNestedResult[1];
// 12: surrounding argument/lazy staging is observed, never inferred from JS.
let mmSequenceTrace = 0;
function mmEffect(value: number) { mmSequenceTrace = mmSequenceTrace * 10 + value; return value; }
function mmCombine(left: number, right: number) { return left * 10 + right; }
let mmSequenceResult = mmCombine(mmEffect(1), [2].map(value => mmEffect(value))[0]);
let mmLazyCalls = 0;
let mmLazyHits = 0;
function mmChoose() { mmLazyCalls++; return false; }
let mmLazyResult = mmChoose() ? [3].map(value => { mmLazyHits++; return value; })[0] : 7;
let mmMatrixReady = true;
