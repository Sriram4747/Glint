# Glint project instructions

## Portable Windows release

- After every change in this repository, run `npm run build:portable` from the project root before marking the work complete.
- Verify that packaging succeeded and refreshed the root `Glint.exe`. Smoke-test the executable and exercise the changed behavior when applicable.
- Treat the root `Glint.exe` as the deliverable for Windows 11 x64 testing. If packaging or verification fails, report the failure and identify which build is available.
