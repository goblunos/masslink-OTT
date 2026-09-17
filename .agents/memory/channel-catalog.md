---
name: Permanent channel catalog
description: Catalog scope and limits of external HLS verification
---
Use a permanently configured lineup rather than re-discovering channels on every page load. When expanding it, check the entire source rather than stopping after a handful of successes.

**Why:** The user requested permanent verified channels, then pointed out that the earlier small sample omitted over 200 additional channels.

**How to apply:** Preserve existing entries when adding verified results, deduplicate stream URLs and IDs, and record verification time. HTTP success and the mere presence of a CORS header do not prove browser compatibility: the allowed origin must match or be a wildcard, and variants, media, initialization fragments, and keys need checks. These checks still do not guarantee decoding or availability from every viewer's region.