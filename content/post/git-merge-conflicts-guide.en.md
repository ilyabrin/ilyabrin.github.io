---
title: "How to Avoid Merge Conflicts: Practical Team Guide"
date: 2024-01-21T10:00:00+03:00
draft: false
author: "Ilya Brin"
tags: ["git", "workflow", "team", "best-practices", "version-control", "merge-conflicts"]
categories: ["Development"]
---

Merge conflicts are every team's pain point. Everyone writes code, everything works, but when it's time to merge branches - chaos begins. Conflicts, lost commits, hours spent understanding someone else's code.

But conflicts aren't a technical problem. They're a process problem. Let's explore how to avoid them.

<!--more-->

## Why Conflicts Happen

Conflicts appear when:

- Branches live too long
- Developers change the same files
- No synchronization with main
- No git workflow rules

If conflicts happen constantly - you have process problems, not git problems.

## Practices That Help

### 1. Short-Lived Branches

The longer a branch lives, the more conflicts:

```bash
# Bad: branch lives for a week
git checkout -b feature/huge-refactoring

# Good: branch lives 1-2 days
git checkout -b feat/add-user-validation
```

Rules:

- Branch lives maximum 1-2 days
- Break large tasks into subtasks
- Synchronize with main daily

### 2. Branch Naming

Bad:

```sh
fix
bugfix
feature
my-branch
```

Good:

```sh
feat/user-auth-oauth
fix/payment-race-condition
refactor/order-service-cleanup
```

Format: `type/short-description`

Types:

- `feat` - new functionality
- `fix` - bug fix
- `refactor` - refactoring
- `docs` - documentation
- `test` - tests

### 3. Rebase Before Merge

```bash
# Before creating PR
git fetch origin
git rebase origin/main

# Or
git pull --rebase origin main
```

Why rebase instead of merge:

- History stays linear
- Conflicts resolved gradually
- No extra merge commits

### 4. Daily Synchronization

```bash
# Every morning
git fetch origin
git rebase origin/main

# Or configure automatically
git config pull.rebase true
```

This prevents accumulation of changes and simplifies conflict resolution.

### 5. Separation of Responsibilities

If two developers constantly change the same files - that's a problem:

```go
// Bad: everyone touches one file
// handlers.go - 2000 lines, 5 people changing

// Good: split by modules
// user_handler.go - Alice works here
// order_handler.go - Bob works here
// payment_handler.go - Charlie works here
```

Solution:

- Agree on responsibility zones
- If changes overlap - synchronize before merge
- Use CODEOWNERS file

### 6. Configure .gitattributes

Some files are better merged automatically:

```bash
# .gitattributes
package-lock.json merge=union
yarn.lock merge=union
*.min.js binary
*.png binary
```

This prevents conflicts in files that don't need manual merging.

### 7. Conflict Resolution Tools

Don't try to fix conflicts in console:

```bash
# Configure merge tool
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'

# Or use built-in
git mergetool
```

Tools:

- VS Code (built-in)
- Meld
- KDiff3
- GitKraken

### 8. Conflict Resolution Algorithm

If conflict happens:

```bash
# 1. See what changed
git diff

# 2. Understand context
git log --oneline --graph

# 3. Contact author if unclear
git blame <file>

# 4. Resolve conflict consciously
# Don't just "accept theirs" or "accept ours"

# 5. Run tests
go test ./...

# 6. Commit
git add .
git commit
```

## What NOT to Do

### Don't Merge Blindly

```bash
# Bad
git merge main
# Conflicts? Whatever, take their version
git checkout --theirs .
git add .
git commit -m "fix merge"
```

This creates hidden bugs.

### Don't Ignore Pre-commit Hooks

```bash
# Set up hooks
# .git/hooks/pre-commit
#!/bin/bash
go fmt ./...
go vet ./...
go test ./...
```

Or use husky/lefthook.

### Don't Merge Without Understanding

"It's just a couple lines" - words before production breaks.

Always understand what you're merging.

## Ideal Process

```go
type GitWorkflow struct {
    BranchLifetime time.Duration // 1-2 days
    DailySync      bool          // true
    Rebase         bool          // true
    CodeOwners     bool          // true
    PreCommitHooks bool          // true
}

func (w *GitWorkflow) IsOptimal() bool {
    return w.BranchLifetime <= 48*time.Hour &&
           w.DailySync &&
           w.Rebase &&
           w.CodeOwners &&
           w.PreCommitHooks
}
```

Components:

1. Small PRs (< 400 lines)
2. Automatic checks (CI/CD)
3. Daily synchronization
4. Clear code ownership
5. Pre-commit hooks

## Automation

### GitHub Actions for Conflict Checking

```yaml
name: Check Conflicts
on: pull_request

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check for conflicts
        run: |
          git fetch origin main
          git merge-base --is-ancestor origin/main HEAD || exit 1
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check formatting
if ! go fmt ./...; then
    echo "Code formatting failed"
    exit 1
fi

# Check linter
if ! golangci-lint run; then
    echo "Linting failed"
    exit 1
fi

# Run tests
if ! go test ./...; then
    echo "Tests failed"
    exit 1
fi
```

## Conclusion

Merge conflicts can be avoided if you:

- Keep branches short
- Synchronize daily
- Use rebase
- Separate responsibility zones
- Automate checks

Main rule: the best conflict is one that never happened.

Set up processes correctly, and conflicts will become rare.

## Additional Resources

- [Git Documentation on Merging](https://git-scm.com/docs/git-merge)
- [Atlassian Git Tutorials](https://www.atlassian.com/git/tutorials/merging-vs-rebasing)
- [Pro Git Book - Branching and Merging](https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging)
