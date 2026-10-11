# D1 local production-preview QA

2026-10-11後續已完成真實Production與Preview驗收；目前結案證據見 [hosted驗收](hosted/README.md)。下文保留原本localhost合成headers的歷史結果與當時限制，不作為hosted證據。

## Final result

Main (`main-orchestrator`) ran the final integrated runtime on 2026-10-11 against the existing production `dist`; no rebuild was performed by this runner. The corrected temporary harness was supplied by `g6-luna-max-bug-fixer`. The final Playwright command collected and passed both targeted projects: desktop at 1280×720 and mobile at 375×812. Result: 2 passed, 0 failed, 0 unrun. This was the focused D1 flow, not the full E2E suite.

Both projects verified starting at 52, recording 4/7/6 to 17/21 and 49 remaining, and the five exact outcomes: PERFECT 3/49 (6.12%), GREAT 8/49 (16.33%), GOOD 4/49 (8.16%), NORMAL 0/49 (0.00%), BURST 34/49 (69.39%). Undoing 6 and recording it again restored 17/21 and 49. Finishing and starting a new round kept 49; the new empty hand showed 0/21 and distribution 0/0/0/49/0. Both runs performed an actual JSON download, cleared local data, selected the downloaded JSON through the file input, previewed and applied it, reloaded the restored session, then started a new round.

Browser checks confirmed the Dito Forge font face loaded, positive probability bars rendered with nonzero widths, and NORMAL 0/49 used inline `0%` with rendered width `0px`. There were no `securitypolicyviolation` events or page errors. The project reports contain the complete browser measurements and flow results: [desktop report](desktop-report.json) and [mobile report](mobile-report.json). Representative screenshots show the initial 4/7/6 state and restored new-round state: [desktop initial](desktop-initial-4-7-6.png), [desktop restored](desktop-restored-4-7-6.png), [mobile initial](mobile-initial-4-7-6.png), [mobile restored](mobile-restored-4-7-6.png).

The production artifact check passed for the three-file `dist` (index plus two referenced assets). Isolated `/tmp` fixtures produced all expected outcomes: the clean artifact passed; `.env`, extra README, extra docs, and a missing referenced asset were rejected. The checker cannot guarantee detection of arbitrary secret strings.

## Commands and build evidence

Main's final runner record is [`run.log`](run.log); raw Playwright output is `/tmp/ticket-D1-qa/playwright.log`, and fixture results are `/tmp/ticket-D1-qa/artifact-fixtures.log`. The final browser command was:

```text
npx playwright test --config=/tmp/ticket-D1-qa/playwright.d1.config.mjs
```

It ran from `/workspace/dv3-dito-web`, started at 11:17:53Z and finished at 11:17:57Z with exit code 0. The existing production build evidence is [engineer-build-final.log](engineer-build-final.log): Vite 7.1.7, 75 modules, green build in 1.38 seconds. Production artifact verification exited 0; all five fixture outcomes matched.

`vercel.json` SHA-256: `cd38367dacf74bf3060754cf928c8f03b98e9e2ca077160200a2bbfc01272d38`.

The recorded asset manifest is [dist-manifest.txt](dist-manifest.txt), with hashes in [dist-manifest.sha256](dist-manifest.sha256):

| Asset | Size |
| --- | ---: |
| `index.html` | 425 bytes |
| `assets/index-D2vP9FtF.js` | 164,139 bytes |
| `assets/index-DG7DsTM-.css` | 37,084 bytes |

## Header and deployment limits

The browser run read CSP, `X-Content-Type-Options`, and `Referrer-Policy` values from `vercel.json`, then synthetically injected those headers only on the localhost root document response with Playwright `route.fulfill`. The browser enforced CSP and the test read the response headers back. This evidence does not establish headers on assets, all Vercel HTTP headers, a hosted URL, or Vercel platform behavior.

Owner's deployment route is that merging to `main` triggers automatic deployment; this route does not require a Vercel token. Hosted behavior was not verified because no hosted URL or deployment record was available, and GitHub API access returned Forbidden. The target project supplied by Owner is `psycho909s-projects/dv3-dito-web`: https://vercel.com/psycho909s-projects/dv3-dito-web. The subsequent Git publication fast-forwarded work into main and pushed commit `2b5c1385ae48fb4205ed88f864b7a9edd8d5f2da`; fetch confirmed origin/main and origin/work matched. Owner confirms this main push triggers the existing integration. Dashboard retrieval then failed with proxy CONNECT 403; platform deployment success and the actual application URL remain unverified. Later receipt-only commits follow the same Git route; the latest origin/main SHA is the current deployment source.

Main's schema evidence is limited to core deployment fields and header structure, not full platform schema validation: [schema source and fingerprint](schema-source.json), [schema check](schema-check.log). Main-owned build, artifact, and lint records are [build-source.log](build-source.log), [artifact-source.log](artifact-source.log), and [lint.log](lint.log). Main reports official Vercel documentation returned HTTP 403; schema material came from the allowlisted npm registry package `vercel@63.1.2`, with source fingerprints retained in `schema-source.json`.

## Reusing the QA runner

The four frozen runner files are preserved in [`runner-source/`](runner-source/) with a `.txt` suffix. From the repository root, copy each file into `/tmp/ticket-D1-qa/` while removing only that suffix, set the three cloud environment values documented in the repository [README](../../../README.md#安裝與執行), then run the shell runner:

```bash
mkdir -p /tmp/ticket-D1-qa
cp docs/verification/D1/runner-source/d1-production-preview.spec.ts.txt /tmp/ticket-D1-qa/d1-production-preview.spec.ts
cp docs/verification/D1/runner-source/playwright.d1.config.mjs.txt /tmp/ticket-D1-qa/playwright.d1.config.mjs
cp docs/verification/D1/runner-source/run-d1-qa.sh.txt /tmp/ticket-D1-qa/run-d1-qa.sh
cp docs/verification/D1/runner-source/verify-artifact-fixtures.mjs.txt /tmp/ticket-D1-qa/verify-artifact-fixtures.mjs
export NPM_CONFIG_CACHE=/tmp/dv3-dito-web-npm-cache
export PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers
export FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf
bash /tmp/ticket-D1-qa/run-d1-qa.sh
```

The runner creates `/tmp/ticket-D1-qa/node_modules` as a symlink to this checkout's `node_modules` when needed. It reuses the existing production `dist` without rebuilding, refuses to start if port 4183 is occupied, and writes run evidence under this directory. Run it when no other D1 runtime writer is active.
