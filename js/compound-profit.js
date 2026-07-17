// ===== Compound Profit Engine =====
// The engine is intentionally thin: ledger.js owns transaction replay, while this
// module exposes a named Beta 1 entry point for future extensions and tests.
function calculateCompoundProfit(inv, untilJ) {
  return buildProfitSchedule(inv, untilJ);
}
