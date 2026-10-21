### Reconciled UI and recovery follow-through

Upstream recovery PR50 is merged; adoption claim PR1059 is merged before the
WeDo pin/wrapper update. This branch now normally composes current main,
preserving the completed STM32/A13/SimLab work and both ledger sections.
The previous browser failures were the 46px toolbar exceeding its 44px limit
and startup JavaScript exceeding the unchanged ownership cap. Restore the row
to 44px with 44px targets and load packaged About credits only when needed,
with localized loading/retry states. Qualify the actual credits content after
loading, the phone chrome geometry, vendor freshness/recovery/LED controls,
and exact-head hosted CI before normal merge. Earlier installed candidates
remain identified separately; no new physical hub or buzzer acceptance is implied.
