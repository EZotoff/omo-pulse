# Branch Protection Setup Guide

This guide documents the repository settings required for the AI review gate and auto-merge workflow to function correctly. These settings must be configured manually in the GitHub UI.

## Current Repository State

The following settings are currently disabled and must be enabled before the AI review workflow can succeed:

| Setting | Current State | Required State |
|---------|---------------|----------------|
| Branch protection on `master` | Not enabled | Required |
| Repository auto-merge | Disabled | Enabled |
| GitHub Actions PR approval | Disabled | Enabled |

## Prerequisites

Before configuring branch protection, ensure you have:

1. Admin access to the repository
2. The AI review workflow files already merged to `master` (`.github/workflows/ai-review-pr-gate.yml` and `.github/workflows/ai-review-gate.yml`)
3. The CI workflow (`ci.yml`) and CodeQL workflow (`codeql.yml`) active

## Step-by-Step Configuration

### Step 1: Enable Repository Auto-Merge

1. Navigate to **Settings** > **General** in your repository
2. Scroll to the **Pull Requests** section
3. Check **Allow auto-merge**
4. Click **Save**

### Step 2: Enable GitHub Actions to Approve Pull Requests

1. Navigate to **Settings** > **Actions** > **General**
2. Scroll to the **Workflow permissions** section
3. Check **Allow GitHub Actions to create and approve pull requests**
4. Click **Save**

### Step 3: Configure Branch Protection for `master`

1. Navigate to **Settings** > **Branches**
2. Click **Add rule** (or edit existing `master` rule)
3. Enter `master` in the **Branch name pattern** field
4. Enable the following settings:

#### Required Settings

| Setting | Value |
|---------|-------|
| **Require a pull request before merging** | Checked |
| **Require status checks to pass before merging** | Checked |
| **Require branches to be up to date before merging** | Checked (recommended) |
| **Require linear history** | Optional (recommended for clean history) |
| **Include administrators** | Optional (recommended for enforcement) |

#### Required Status Checks

Search for and select these status checks:

1. `build` — CI build job
2. `test` — CI test job
3. `Analyze` — CodeQL security analysis
4. `prepare-scorecard` — AI review scorecard preparation
5. `ai-review-gate` — AI review policy gate

**Note:** Status checks only appear in the search after they have run at least once on the default branch. If you do not see them, trigger a workflow run on `master` first.

5. Click **Create** (or **Save changes** if editing)

## Verification Checklist

After configuration, verify the following:

- [ ] Auto-merge option appears in pull request UI
- [ ] Creating a test PR triggers all five required checks
- [ ] The AI review gate job runs and produces a decision
- [ ] GitHub Actions can submit PR approvals (test with a low-risk PR)

## Troubleshooting

### Status checks not appearing in branch protection

Status checks must run on the default branch at least once before they appear in the search. Push a commit to `master` or merge a PR to trigger them.

### Auto-approval fails despite gate passing

Verify both settings from Steps 1 and 2 are enabled. The workflow logs will indicate which permission is missing.

### PRs blocked unexpectedly

Check the **Require branches to be up to date** setting. If enabled, PRs must be rebased on the latest `master` before merging, even if checks pass.

## Workflow Dependency Map

```
CI Workflow (ci.yml)
├── build ──────────────────────┐
└── test ───────────────────────┤
                                │
CodeQL Workflow (codeql.yml)    │
└── Analyze ────────────────────┤
                                │
AI Review PR Gate (ai-review-pr-gate.yml)
├── prepare-scorecard ──────────┤
└── ai-review-gate ─────────────┘
         │
         ▼
    Reusable gate
    (ai-review-gate.yml)
         │
         ├── Outputs: decision, blocked, auto_approve
         │
         └── auto_approve job (conditional)
              ├── Approve PR
              └── Enable auto-merge
```

All five jobs must pass before a pull request can be merged when branch protection is fully enabled.

## References

- [GitHub Docs: Managing branch protection rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [GitHub Docs: Auto-merge](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request)
- Workflow files: `.github/workflows/ai-review-pr-gate.yml`, `.github/workflows/ai-review-gate.yml`
