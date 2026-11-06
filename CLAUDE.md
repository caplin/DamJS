# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DamJS is a bookmarklet ("scriptmarklet") for inspecting and tampering with Caplin StreamLink traffic inside a running web app. It is served as static files from GitHub Pages (https://caplin.github.io/DamJS) — the `gh-pages` branch *is* the deployed site, so pushing to it publishes changes. There is no build step, bundler, or linter: files are loaded directly in the browser as-is. `package.json` only exists for the Playwright e2e tests.

## Running / testing

- **Use it:** `index.html` contains the bookmarklet. It sets `window.damJSDomain` and injects `index.js` from that domain. To test local changes, serve the repo over HTTP (e.g. `python3 -m http.server`) and use a bookmarklet with `damJSDomain` pointed at your local server, then run it on a page that exposes `window.caplin.streamlink`. (`scriptmarklet.js` is an old variant pointing at a fork's domain.)
- **E2E tests (Playwright):** `npm install`, then `npm run test:e2e` (or `test:e2e:headed`). They need a running fxtrader / FX Pro at `FXTRADER_URL` (default `http://localhost:8080`, logs in as `user1@caplin.com` with MFA `111111`). `playwright.config.ts` serves this repo on port 8125 (`DAMJS_PORT`) and `e2e/helpers.ts` injects DamJS the same way the bookmarklet does, then asserts on DamJS's `console.log("Incoming:"/"Outgoing:", ...)` output. The DamJS panel covers the first tile column, so tests click other tiles.
- **Legacy tests:** `tests/test.html` is a QUnit + Sinon page opened in a browser. These tests are stale: they target an older global-function/Knockout version of `DamJS`/`DamJSPlugin` (and reference `lib/knockout.js`, which no longer exists), not the current AMD/React modules. Don't expect them to pass without rework.

## Architecture

- **Bootstrap (`index.js`):** Loads `lib/require.js` into the host page, temporarily stashing and restoring any existing `exports`/`define`/`require` globals so it doesn't clobber the host app's module system. Requires `window.caplin.streamlink`, then creates a `DamJS` instance, registers a set of preset subject matchers (`addNewMatcher(...)`), and renders `DamJSElement` into a new div appended to `<body>`. Also contains generic drag-and-drop code for elements with class `drag`.
- **Modules:** Every UI/logic file at the repo root is an AMD module (`define([...], fn)`) loaded with `baseUrl: damJSDomain`. UI uses **React 0.12** (`lib/react.js`) via `React.createClass` and calling components as functions (no JSX, no `React.createElement`). Styles are inline objects; `listStyle`/`columnStyle` are globals set in `index.js`.
- **Interception (`DamJS.js`):** Uses `lib/meld` (AOP library) `meld.around(...)` to wrap StreamLink internals. `setListeners()` has two code paths:
  - **StreamLinkTS ≥ 7.1.12** (detected by `streamlink.getVersion`): wraps instance methods on `_streamLinkCore._subscriptionManager` (`send`, `onUpdate`) and the streamlink (`publishToSubject`, `subscribe`). Incoming events are wrapped per-event in `onUpdate` by RTTP code (`RECORD_TYPE_1_CODE`/`RECORD_TYPE_1_IMAGE_CODE` constants defined just above the `define` call — note these string literals contain a hidden null character, so edit them carefully — and `"6k"` for permissions).
  - **StreamLinkJS ≤ 7.0.4**: wraps prototypes under `streamlink.impl.*` (`SubscriptionManager`, `StreamLinkCoreImpl`, `RecordType1EventImpl`, `PermissionEventImpl`, `StreamLink`).
  `window.originalStreamLink` takes precedence over `window.caplin.streamlink` (for compatibility with StreamLink dev tools). Changes to interception usually need to be made in both branches.
- **Matchers (`DamJSMatcher.js`):** One per subject prefix. Each has flags for filter / inject / log on incoming and outgoing traffic, plus injection field lists. `DamJS.handleUpdate`/`handlePublish`/`handleSubscribe` iterate matchers to decide whether to `joinPoint.proceed()` (pass through), mutate fields (inject), hold back (filter — captured join points are stored on the matcher and can be released later from the UI), or `console.log`. `alreadyExists` dedupes incoming updates fanned out to multiple listeners using `_timeReceived` + `_rttpSequenceNumber`.
- **UI ↔ model:** Model objects push state into React components manually (`setReact`/`updateReact` calling `component.setState`, or `damJS.onUpdate(fn)`), rather than components owning state.
- **Permissions UI (`Perm*.js`) and the top of `DamJS.js`:** Helpers that reach into StreamLink/permission-engine private fields (e.g. `m_mEngines.MASTER.m_mUsers`) and use a global `x` captured from subscription internals (legacy path only) to fabricate permission events. These depend on undocumented StreamLink internals and break easily.

## Notes

- `lib/meld.js` is the one actually loaded; root `meld.js` is a different, unused copy.
- Code relies heavily on StreamLink private fields (`_fields`, `_streamLinkCore`, `_subscriptionManager`, etc.); verify against the target StreamLink version when changing interception.
