# Bounded price gap verification

Checked 22 October 2026 (Asia/Bangkok). Registered NABC monthly year-month endpoint; six HTTP calls, no retries. Years selected cover gaps across all six series and the October 2012 conflict.

| Call | Year AD | HTTP | Result |
|---:|---:|---:|---|
| 1 | 2022 | 403 | access_denied_or_filtered |
| 2 | 2022 | 200 | received |
| 3 | 2012 | 200 | received |
| 4 | 2013 | 200 | received |
| 5 | 2015 | 200 | received |
| 6 | 2026 | 200 | received |

Annual-response month comparisons completed: 77. The imported histories retain 221 missing months across six series. This bounded check cannot certify historical completeness or provider publication absence.

October 2012 conflict: authoritative resolution and publication ordering remain unverified. Existing quarantine must remain; retrieval time is not publication time.

Evidence: data/local/probes/price-gap-verification/summary.json and per-call metadata. No prices in this document; rights remain pending. No database writes or core changes.

Five successful annual responses are complete according to provider pagination (count equals total). Checked 77 of 221 gap months across all six affected series; none of those 77 months appeared under the matching product name in the annual endpoint. The other 144 months remain unchecked. Agreement between these two endpoints does not establish why months are absent.

The annual 2012 response still has two October rows for the quarantined product with two distinct values and no issue/release fields. No official resolution was established; quarantine remains necessary.
