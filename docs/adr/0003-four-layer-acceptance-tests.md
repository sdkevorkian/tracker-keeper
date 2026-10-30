# Acceptance tests in four layers, run by Vitest and Playwright Test

Ticket acceptance criteria are written as acceptance test cases in `app/acceptance/`, in four layers: **cases** written only in the glossary's language, a **DSL** that turns them into driver calls and fills in defaults, **protocol drivers** that each reach the app one way, and the app itself. There are two drivers: the **Workspace driver** calls the headless Workspace in-process, and the **browser driver** drives the built app in Chromium. The same case runs against both wherever it makes sense. A driver declares its capabilities, and a case that needs one the driver lacks is skipped with the reason in the report, so a feature can land in the Workspace before the UI reaches it.

Each driver runs under its own runner, and both import the same case files. The Workspace driver runs under **Vitest**, because the Workspace depends on Vite's config (the legacy pdf.js alias in Node, JSON imports without an import attribute), which Playwright Test's loader doesn't apply. The browser driver runs under **Playwright Test**, for its browser handling, web server and traces. Cases and the DSL import nothing from either runner, React or the Workspace; assertions use `node:assert`.

This adds a layer to the Testing Decisions in #1. Detailed variations (for example, two fonts sharing a character code) stay as Vitest tests through the Workspace, and React Testing Library stays for screens with behaviour of their own. Acceptance cases cover a ticket's criteria, not every variation.

## Considered Options

- **Playwright Test for both drivers**: one runner and one report, but it can't load the Workspace without duplicating Vite's config in a custom loader.
- **Vitest for both drivers**, with the browser driver launching Chromium through the `playwright` library: one runner, but it gives up Playwright Test's web server, traces and browser fixtures.
- **Vitest with `@vitest/web-worker` and no browser**: cheap, but it only simulates a worker on the main thread and can't see the canvas or the file picker.

## Consequences

There are two configs and two reports. `npm run test:acceptance` runs both, and CI runs it as its own job. Browser-only behaviour (the worker, the canvas, pan and zoom) can only be tested through the browser driver, and the app has to show what the canvas draws in a form the driver can read, such as an accessible label.
