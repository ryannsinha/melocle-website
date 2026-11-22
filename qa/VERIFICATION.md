# Melocle local verification

The source is a local preview: HTML/CSS/JavaScript, a loopback Python server and a private SQLite request store. No external email, CRM or deployment is triggered.

## Automated checks

Run `npm run check` for JavaScript syntax validation and six isolated HTTP/database integration tests. Tests cover request validation, normalized-email deduplication, attribution, token-authorized edits/deletion, private-file restrictions, lifecycle milestones, events and persistence after reopening the database. Test databases are temporary.

## Browser verification

Current Chromium reports included in this repository:

- `full-width-submenu-results.json`: the black submenu spans the viewport, remains sticky and leaves at Unibox at 1920, 1440, 768, 390 and 320px. No horizontal document overflow.
- `aligned-body-widths.json`: body surfaces align with the footer’s 1240px maximum content width and responsive gutters. Header dimensions before/after were unchanged.
- `aligned-body-layout-results.json`: 82/82 checks passed for the core product and persona cards at six viewports, all eight walkthrough views, all 36 signals, privacy, metadata and anchors.
- `aligned-body-features-results.json`: 51/51 checks passed for responsive body alignment, full Lead Magnets/Warm Introductions cards, CTA/focus behavior, the sticky menu and valid SVG references.
- `aligned-body-preview-results.json`: eight preview options share consistent dimensions across eight regular, expanded-mobile and enlarged-text configurations, without clipping or horizontal document overflow. Mobile menu labels keep a constant font weight to avoid a selected-label wrapping jump.
- `revenue-journey-results.json`: 28/28 checks passed for source-to-outreach context, the local access flow, source/role capture, reached-stage history and acquisition cohorts. The later layout update replaces its collapsed relationship row with the expanded cards covered by the newer report.

All temporary request fixtures were deleted by their own IDs after checks. Anonymous local journey counts can include test visits; they are not production conversion metrics. Historical screenshots and browser traces are kept locally and excluded from Git.

## Scope

Reviewed desktop and phone layouts include the approved white hero, Dashboard 2 logo/Mello treatment, compact eight-view walkthrough, five sticky product cards, black submenu exit, five stacking persona stories, expanded relationship features and the access form. Body surfaces are constrained; the header and black submenu background span the page.

The evidence is scoped to the stated local Chromium checks. It does not establish cross-browser or screen-reader conformance, conversion lift, product availability or customer outcomes. Real public domain/contact/privacy configuration and production request handling remain separate launch work. Canonical/social URLs are currently loopback and the page is deliberately noindex.
