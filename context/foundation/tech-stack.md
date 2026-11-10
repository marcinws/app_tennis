---
starter_id: 10x-astro-starter
package_manager: npm
project_name: tennis-match-companion
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo developer shipping a small mobile-browser web app in three weeks of after-hours work needs an agent-friendly starter with auth and a database ready from day one. The 10x Astro Starter is the recommended default for a JavaScript/TypeScript web app and clears all four agent-friendly gates; email-and-password accounts (FR-001, FR-018) come from its built-in auth, and the scoring rules stay testable in typed TypeScript. Its bootstrapper confidence is first-class, so expect mostly smooth scaffolding with occasional manual steps. The starter does not cover recording a match under a weak connection (FR-011): that needs on-device persistence with later sync, built on top of the starter, and is the largest piece of custom work. Payments, realtime, AI and background jobs are out of scope. Deployment goes to Cloudflare Workers (a Worker with static assets; `@astrojs/cloudflare` v14 no longer supports Cloudflare Pages) through GitHub Actions with auto-deploy on merge to main.
