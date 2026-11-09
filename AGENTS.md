# Agent context

Read `README.md` before substantial changes. The backend is in `blind675/world-sim-3-server`; its `docs/PROJECT_OVERVIEW.md` is the shared project overview and its PRD and checklist are historical planning documents.

Check the backend API before changing client requests or response types. Coordinate cross-repository API changes in both repositories.

## Branch and release policy

`staging` is the integration branch for ordinary work in all three repositories (server, web client, mobile). Before editing, fetch and switch to `staging`; commit and push fixes, features, and documentation there. Do not commit or push routine work to `main`, even if the local checkout starts on `main`. Keep GitHub's default branch as `main` for now.

`main` is the production release branch. Merge or push to `main` only when the user explicitly requests a release to `main`, after reviewing the staging diff and running the relevant checks. A staging push is not a release. See the backend's [release workflow](https://github.com/blind675/world-sim-3-server/blob/staging/docs/RELEASE_WORKFLOW.md) for the cross-repository release order and deployment-cost notes. Tell the user which branch received each change.
