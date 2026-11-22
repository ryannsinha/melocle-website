# Melocle marketing website

A local marketing website for Melocle’s connected social GTM workflow. Nothing is deployed or sent to external services.

## Run locally

From this directory, run `npm run dev` and open <http://127.0.0.1:4181/>. Review local requests at <http://127.0.0.1:4181/local/review>.

The site uses buildless HTML/CSS/JavaScript and a Python 3 standard-library server. No package installation is required. The server binds to loopback only. Keep port 4180 available for the separate Dashboard 2 app, which was read as a design reference and was not edited.

`python3 server.py --port 4182 --db /tmp/melocle-preview.sqlite3` starts an isolated preview with a different database. The marketing application uses relative API paths.

## Buyer story

Content Studio turns expertise into a point of view. Social Chorus helps employees share the story in their own voices. Thirty-six signal types add context across buying intent, audience engagement, account changes and content intelligence. Outreach starts with leads discovered through signals and post engagement; importing an existing list is an additional option. Unibox carries the context into replies and next steps.

The walkthrough immediately below the hero follows one demonstration workspace from a content draft to a reply, with links into eight views. Source evidence carries into the outreach draft. No customer logos, testimonials, revenue results or conversion benchmarks are invented. The walkthrough reserves one shared frame size across all eight options, using compact example layouts rather than extra empty height. Overview uses a two-column layout on desktop. Mobile examples show a readable, concise view, with an option to expand the workspace example and step descriptions.

Lead Magnets and Warm Introductions have a dedicated, fully visible two-card section with resource-request and shared-connection previews. The primary audience is founder-led B2B teams. Five persona stories retain one goal and three short workflow steps: founders, marketing teams, sales/RevOps, experts/consultants and agencies. Detailed capability research is retained in `reference/platform-capabilities.js`; the former long feature catalog is not loaded by the page.

## Design and interaction

Body surfaces share the footer’s 1240px maximum content width and responsive gutters. The header retains its existing width rules. The palette remains near-black, white, warm off-white, light-gray borders and electric blue. A white text-led hero with subtle pointer-responsive workflow icons leads into the inset dark walkthrough. Dark Signals and Mello chapters, the black product submenu, a black persona rail, selected dark persona cards and a blue closing section establish the page rhythm.

The blurred translucent header adapts to the surface beneath it. The logo follows Dashboard 2’s original symbol and Sora lettering. Manrope and Sora fonts are served locally, with licenses retained. Mello uses Dashboard 2’s ThinkingOrb design through a checked-in local bundle; no runtime installation is needed. The bundle preserves the dependency notices.

Five equal-height product rectangles stack using native sticky positioning, revealing prior-card edges. Their black submenu leaves as Unibox reaches it. The use-case heading and menu stay together on the left while five compact stories stack on the right. Natural-position markers preserve anchor navigation and active-menu tracking.

Reduced motion uses readable ordinary flow. Short viewports and increased text spacing also use flow when a stack cannot fit. Intrinsic content resize observers recalculate use-case heights rather than allowing enlarged text to be covered. Decorative cursor motion is bounded, pauses offscreen and does not run for touch or reduced motion.

## Request-based early access

Every primary CTA says **Request early access**. Availability, setup, any pricing and the next step are confirmed individually. The website makes no fixed response-time, free-trial or guaranteed-access promise.

The form asks for email, optional company and one of the five precise personas. A use-case CTA prefills the corresponding persona. After saving, an optional starting-workflow choice adds context without lengthening the initial form. Requests can be edited, downloaded, reopened after reload or deleted. Failures retain the entered values and support retry.

The preview stores records in `.local/melocle.sqlite3`, ignored by source control. The directory is restricted to the current user and the database is created with mode 0600. Repeat submissions with the same normalized email update one record; first acquisition context is preserved and latest acquisition/CTA context is updated. Self-service changes use a browser-held request token. No invitation, email, CRM write or actual product account is created. The form states that the request is saved on this device; the privacy dialog explains storage and local behavior.

The local review desk includes a qualification/first-value playbook, source cohorts and preserved stage milestones. Closing a request does not erase previously reached milestones. It supports ownership, notes and manual lifecycle stages from requested through first value, repeated use and paid customer, plus filtering, export and deletion. Recording a stage does not grant access or contact anyone. It also contains eight initially unverified launch-readiness gates, with owners and evidence notes.

## Local measurement and privacy

Anonymous local visitor/session IDs, first/latest campaign and referrer context, CTA placement, persona, workspace views, form starts, validation/failure events and server-accepted requests are stored locally. No third-party tracking is loaded. The privacy dialog explains this behavior. Local journey counts are test activity, not production conversion benchmarks.

The review API is a loopback preview tool, without production authentication. Do not expose this server publicly. A public launch still needs confirmed product scope and evidence, an operational follow-up owner, real contact/privacy details, a production request service, appropriate authentication/consent, a real domain and production measurement. The current canonical/social URLs are local and the page is deliberately `noindex,nofollow`.

## Files and checks

- `index.html`, `content.js`, `script.js`: page, examples and scrolling interactions.
- `styles.css`, `premium.css`, `audit.css`: base styling, visual design and audit refinements.
- `requests.js`, `server.py`: request flow, local attribution and SQLite persistence.
- `local-review.*`: local request review and launch-readiness desk.
- `assets/favicon.svg`, `assets/social-preview.html`, `assets/social-preview.png`: local brand metadata assets. The share image is generated from its HTML source.

Run `npm run check` for shipped JavaScript syntax checks and six isolated HTTP/database integration tests. Current browser evidence is listed at the top of `qa/VERIFICATION.md`. Checks establish local functionality and reviewed Chromium layouts; they do not establish conversion lift, cross-browser conformance or product availability.
