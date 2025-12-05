# decision Log

[DECISION:2025-12-05] AI-Memory initialized

[DECISION:2025-12-05] | 2025-12-05 | Use wasmBinary buffer instead of locateFile callback for sql.js initialization | The locateFile callback with file:// URLs doesn't work in VS Code extension context (both local and remote SSH). Loading the WASM file directly as a Buffer and passing it via the wasmBinary option is the most reliable method. This approach works in all contexts: development, installed extension, and remote environments. |

[DECISION:2025-12-05] | 2025-12-05 | Bundle sql.js (8.3MB) into VSIX package instead of relying on external node_modules | VS Code extensions don't include node_modules by default. Extensions run in isolation, so sql.js must be bundled. Added !node_modules/sql.js/** to .vscodeignore to include it. This increased VSIX size from 310KB to 8.3MB but ensures database functionality works in all installation scenarios. |

[DECISION:2025-12-05] | 2025-12-05 | Implement 3-tier fallback path resolution for WASM file location | Different contexts (development vs installed extension vs remote) resolve paths differently. Method 1: require.resolve (works when node_modules accessible), Method 2: __dirname/../node_modules (extension installation directory), Method 3: process.cwd() (development mode). This ensures WASM loads in all scenarios with comprehensive error logging for diagnostics. |

[DECISION:2025-12-05] | 2025-12-05 | Investigate Codecov badge showing 0% coverage for ai-skeleton-extension main branch | Codecov uploads likely failing in CI. Workflow uses codecov/codecov-action@v4 with token secret, but if CODECOV_TOKEN is not set or Codecov app is not installed, uploads silently skipped (fail_ci_if_error=false), leading to 0% badge. Need to verify CI logs, set Codecov token secret or enable OIDC, and explicitly pass coverage file path ./coverage/coverage-final.json from c8. |

[DECISION:2025-12-05] | 2025-12-05 | Code coverage badge at 0% likely due to release commits with [skip ci] and missing Codecov uploads | Release workflows auto-commit version bumps with [skip ci], skipping the main CI test workflow that runs coverage upload. Latest main commits therefore have no Codecov upload, so badge shows 0%. Additionally Codecov action lacks explicit coverage file path and may fail if CODECOV_TOKEN not set or OIDC permissions absent. |

[DECISION:2025-12-05] | 2025-12-05 | Hardened Codecov upload and removed [skip ci] from release workflows | Badge was 0% because release/version-bump commits skipped CI. Updated test workflow to explicitly upload ./coverage/coverage-final.json with strict failure and verbosity, and removed [skip ci] from build-on-pr-merge, minor-release, and critical-patch commit messages so CI (and coverage upload) runs on release commits. Added job permissions for future OIDC use while keeping token. |

[DECISION:2025-12-05] | 2025-12-05 | E2E tests require workspace context - added temporary workspace folder to test runner | Memory service needs vscode.workspace.workspaceFolders to create AI-Memory folder. E2E tests were running without workspace, causing 3 test failures. Added temp workspace creation/cleanup in runTest.ts to provide proper test environment. |

[DECISION:2025-12-05] | 2025-12-05 | Skip setup dialogs in E2E test environment using ExtensionMode.Test detection | VS Code test runner explicitly refuses to show dialogs, causing extension activation to fail. By detecting test mode and skipping showSetupDialog() and update prompts, the extension can activate fully and register all commands for E2E tests. |

[DECISION:2025-12-05] | 2025-12-05 | Skip VSIX packaging on Node 18.x in CI workflow | The undici package (used by @vscode/vsce) requires the File global which is not available in Node 18.x. Only run VSIX packaging on Node 20.x to avoid compatibility issues. |

[DECISION:2025-12-05] | 2025-12-05 | MemoryStore singleton must check if database FILE exists, not just path match | Singleton was returning 'already initialized' when path matched but file was deleted (e.g., by test cleanup). Added fs.existsSync() check to detect deleted files and properly reinitialize the database in those cases. |

[DECISION:2025-12-05] | 2025-12-05 | Adopt permanent dev/release branch model with PR-gated releases | VS Code extension requires production stability for marketplace users. Proposed model (dev branch for work, release branch for stable-only via PR merge) provides: clear separation of concerns, explicit release decision gate, quality assurance checkpoint, easy rollback, and follows industry standard git-flow variant. Validates as sound architectural decision. |

[DECISION:2025-12-05] | 2025-12-05 | Branch triggers updated: test.yml runs only on dev branch, release.yml created for release branch merges | Separates development (fast iteration on dev) from release (comprehensive validation on release). Prevents marketplace publish from dev branch, ensures only release branch can publish to production. |

[DECISION:2025-12-05] | 2025-12-05 | Release branch protection rules: PR-only, status checks required, branches must be up-to-date | Ensures all release code is reviewed and tested before merge. Prevents accidental pushes to release. Allows admin override for emergency hotfixes. |

[DECISION:2025-12-05] | 2025-12-05 | Marketplace publishing moved from test.yml to release.yml, triggered by release branch merge | Makes release decision explicit (human PR merge) rather than automatic. Ensures only release branch code reaches marketplace. Provides quality gate: full test suite runs before publish. |

[DECISION:2025-12-05] | 2025-12-05 | Release branch created and pushed to origin | Created 'release' branch from main (v0.1.29) to serve as stable-only branch. Pushed to origin for GitHub integration. Next: Configure GitHub branch protection rules via web UI. |

[DECISION:2025-12-05] | 2025-12-05 | Dev/release workflow fully implemented and committed | All 5 implementation steps completed: (1) release branch created, (2) branch protection setup documented, (3) test.yml updated to trigger on dev only, (4) release.yml created for release merges, (5) CONTRIBUTING.md documented workflow. Build passes, all 138 tests green. Ready for first release via PR. |

[DECISION:2025-12-05] | 2025-12-05 | Added Codecov integration with 95% coverage gate requirement | Enforces minimum code coverage on releases; prevents regressions; Codecov app provides automatic PR comments and status checks; configured with 1% threshold variance to allow natural fluctuations" |

[DECISION:2025-12-05] | 2025-12-05 | Added CodeQL code scanning workflow for dev/release branches | Branch protection shows pending code scanning on PRs; adding standard CodeQL workflow ensures required security check completes on dev→release merges. |

[DECISION:2025-12-05] | 2025-12-05 | Redesigned release pipeline: trigger on push to release, compile before tests, run E2E; retired legacy main-based workflows | Release workflow failed due to missing dist; switching to push trigger and adding compile/E2E fixes failure and clarifies flow. Legacy workflows based on main caused ambiguity, so they are gated/retired in favor of dev→release model. |

[DECISION:2025-12-05] | 2025-12-05 | Created remote dev branch from main | Aligns with dev→release workflow; remote dev was missing, causing confusion. Now development can target dev branch and release remains protected. |

[DECISION:2025-12-05] | 2025-12-05 | Fixed release workflow marketplace publish: bumped version to 0.1.30 and merged main→release to trigger new release | Previous v0.1.29 was already published to marketplace, causing publish rejection. Bumping version and re-triggering release allows fresh publish to succeed. |

[DECISION:2025-12-05] | 2025-12-05 | Add Codecov upload to release workflow | Release builds were not sending coverage to Codecov; added codecov/codecov-action@v4 step with coverage-final.json and fail-fast settings to release.yml so coverage is reported during release branch pipeline. |

[DECISION:2025-12-05] | 2025-12-05 | Implement pre-release workflow on main that bumps patch, builds VSIX, uploads to Codecov, creates GitHub pre-release, and pushes version bump | Requirement: build on dev/main with auto patch bump and publish pre-release tag/artifact before release PR publishes to marketplace. New workflow pre-release.yml handles patch bump, tests, Codecov, VSIX packaging, commit, and pre-release tag/release with artifact. |

[DECISION:2025-12-05] | 2025-12-05 | Modify release workflow to consume pre-release VSIX artifact and upload coverage | Release pipeline should use artifact built on main and reported to Codecov; updated release.yml to download VSIX from pre-release tag v<version>, upload coverage, and publish marketplace using that artifact. |

[DECISION:2025-12-05] | 2025-12-05 | Expand CI test workflow triggers to include PRs targeting main and add manual dispatch | Branch protection checks for PRs into main were stuck because test.yml did not run for that target. Adding main and workflow_dispatch ensures required statuses are produced and allows manual reruns. |

[DECISION:2025-12-05] | 2025-12-05 | Merge origin/main into feature/prerelease-pipeline before PR to resolve divergence | Branch was behind main causing potential conflicts. Merging main now ensures PR will be fast-forwardable and tests reflect latest main changes. |

[DECISION:2025-12-05] | 2025-12-05 | Embed cleanup requirement into Checkpoint prompt and remove lingering .bak backups | Backups should not linger after checkpoint; git history suffices. Added explicit instruction to delete .bak files and temporary artifacts, and removed existing workflow backups to keep workspace clean. |
