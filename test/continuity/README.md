# GovKM Scenario 001 — operative-state resurrection

This is a bounded synthetic contribution for Nocetta.

## Purpose

Test one continuity invariant:

> When A was once current, B supersedes A, and B later ceases to be current without a replacement, current-state retrieval must not resurrect A merely because A remains valid historical evidence.

The fixture deliberately separates:

- preservation of history,
- current-state selection,
- supersession,
- retirement/no-current-state,
- and historical reconstruction.

Expected behavior after B retires with no replacement: **no current answer**.

Historical queries must still reconstruct A before the supersession and B while B governed.

## Contribution boundary

This fixture contains only a narrow synthetic test and expected behavior. It does not contribute GovKM's broader ontology, scoring methodology, continuity architecture, private benchmark corpus, or implementation logic.

No production data, customer data, credentials, or private logs are included.

## CLA

The pull-request description will include the repository's required CLA acceptance statement.
