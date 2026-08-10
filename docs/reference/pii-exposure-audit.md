---
title: PII Exposure Audit
description: Bounded audit of tracked pi-sprite files for PII exposure and local-secret hygiene.
---

# PII Exposure Audit

Audit date: 2026-08-10  
Scope: tracked repository files only, excluding binary image assets, `node_modules`, generated sites and test artifacts, and third-party package contents.

This is a point-in-time source review, not a guarantee that runtime user input or externally imported pet assets cannot contain personal data. pi-sprite deliberately processes session text for `/recap` and contextual `/btw`; its extension code does not add a separate plaintext PII store or emit that text through application logs.

## Method

The audit searched TypeScript, JavaScript, Python, shell, JSON/JSONL, YAML, Markdown, CI, Mise, and Harness files for literal email, telephone, SSN, payment-card, IP-address, address, date-of-birth, identity-document, and structured personal-name patterns. It also reviewed console/error interpolation, completion authentication, session-entry persistence, JSON/file writes, environment/configuration files, CI workflows, tracked sensitive-file names, and `.gitignore` coverage.

`demos/wendybot3000/fixture-session.jsonl` and all test fixtures were reviewed separately. They contain product/demo labels and synthetic localhost endpoints only; no realistic personal names, contact details, government identifiers, or financial data were found. `127.0.0.1` occurrences are loopback endpoints for tests and demos, not user identifiers. The committed `apiKey: "demo"` value in the WendyBot3000 provider is an intentional non-secret placeholder. API-key references in runtime and authoring code obtain credentials from Pi's model registry or environment at execution time; no committed credential value was found.

## Findings

### 1. Local environment files were not ignored

- file: `.gitignore`
- line: 6 (remediated)
- category: `gitignore-gap`
- severity: medium
- detail: The ignore policy had no `.env*` pattern, so a local environment file containing API credentials or user-data connection settings could be accidentally staged.
- recommendation: Ignore `.env*`; retain an explicit `.env.example` negation only for non-secret templates.

### 2. Private-key and credential filenames were not ignored

- file: `.gitignore`
- line: 8-11 (remediated)
- category: `gitignore-gap`
- severity: medium
- detail: The ignore policy did not cover common private-key and credential filenames (`*.pem`, `*.key`, `credentials.*`, and `secrets.*`). Such files can contain credentials that expose access to user data.
- recommendation: Ignore those filename patterns and commit only deliberately reviewed, redacted examples through explicit negations when needed.

### 3. Common user-data export formats were not ignored

- file: `.gitignore`
- line: 13-15 (remediated)
- category: `gitignore-gap`
- severity: low
- detail: SQL, CSV, and XLSX exports were not ignored. Local database dumps and spreadsheets often contain contact or account data and are easy to stage accidentally.
- recommendation: Ignore `*.sql`, `*.csv`, and `*.xlsx`; add a narrow explicit negation only for a vetted synthetic fixture.

## Remediation verification

The remediation adds all listed patterns to `.gitignore`. `git ls-files` found no tracked `.env*`, private-key, credential/secret, SQL, CSV, or XLSX file. Verify a local checkout with:

```sh
git check-ignore -v .env .env.local id_rsa.pem server.key credentials.json secrets.yaml dump.sql users.csv users.xlsx
```

Each path should resolve to the corresponding `.gitignore` rule. `.env.example` remains eligible for tracking and must never contain a real credential.

## Reviewed non-findings

- No hardcoded personal email addresses, phone numbers, SSNs, payment-card numbers, street addresses, dates of birth, passport/driver-license values, or realistic structured personal names were found in tracked text files.
- No application log, notification, or error path was found interpolating an identified PII field. Errors include operational values such as URL/status or filesystem entry names; these are not user-identity fields in this package.
- No committed plaintext secret, API key, token, password, or credential was found in environment files, configuration, Docker configuration, or CI workflows. GitHub Actions uses OIDC permissions for publishing and deployment.
- No database schema or application-managed persistent store for raw PII was found. Pet manifests and sprite state persist visual metadata only. Pi session and BTW child-session mechanisms may contain user text under Pi-managed session storage, but this extension does not introduce a new PII-specific plaintext store or log stream.

## Totals

| Category | Critical | High | Medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| hardcoded-pii | 0 | 0 | 0 | 0 | 0 |
| pii-in-logs | 0 | 0 | 0 | 0 | 0 |
| env-secret | 0 | 0 | 0 | 0 | 0 |
| unencrypted-storage | 0 | 0 | 0 | 0 | 0 |
| gitignore-gap | 0 | 0 | 2 | 1 | 3 |
| **Total** | **0** | **0** | **2** | **1** | **3** |
