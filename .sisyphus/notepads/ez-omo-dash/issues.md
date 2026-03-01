# Test Suite Quality Issues - ez-omo-dash

## Coverage Gaps

### Missing Component Tests
- **ProjectStrip component**: No unit tests exist for the core UI component that renders project strips. Critical functionality like expand/collapse, status display, and layout logic is untested.
- **Sparkline component**: No tests for SVG rendering, stacked bar calculations, or mini/full mode switching. Complex math for scaling and segment computation is unverified.
- **PlanProgress component**: No tests for progress bar rendering, step checklist display, or compact/full mode differences.
- **DashboardHeader component**: No tests for theme toggle, expand/collapse buttons, connection status, or time formatting.

### Missing Module Tests
- **App.tsx**: Main application component has no tests for routing, data polling, or error boundaries.
- **useDashboardData hook**: Data fetching and polling logic is untested. No tests for API error handling, retry logic, or state updates.
- **server/dashboard.ts**: Dashboard store implementation has no tests. Lazy loading, caching, and dirty-flag logic is unverified.
- **Ingestion layer modules**: Zero test coverage for:
  - sources-registry.ts (source loading, registry reading)
  - session.ts (session metadata reading)
  - boulder.ts (plan progress derivation)
  - timeseries.ts (activity time series)
  - sqlite-derive.ts (SQLite query functions)
  - background-tasks.ts (background task reading)
  - token-usage.ts (token usage aggregation)
  - tool-calls.ts (tool call derivation)
  - token-usage-core.ts (core token logic)
  - model.ts (model string extraction)

### Missing Integration Tests
- No tests for end-to-end data flow from SQLite → ingestion → API → UI
- No tests for component integration (e.g., ProjectStrip with Sparkline children)
- No tests for server startup and API mounting

### Edge Cases Not Tested
- Network failures during API polling
- Corrupted SQLite database files
- Missing or malformed project directories
- Sources registry with invalid entries
- Time series data with gaps or outliers
- Component rendering with missing or malformed props

## Mock Quality Issues

### Overly Broad Mocks (Hiding Real Bugs)
- **api.test.ts:8-61**: Mocks entire modules (bun:sqlite, sources-registry, multi-project, etc.) with generic return values. This prevents testing real SQLite interactions, path resolution, or data transformation logic.
- **multi-project.test.ts:13-23**: Mocks createDashboardStore with a simple function, hiding caching and error handling bugs.
- **per-session-timeseries.test.ts:7-15**: Mocks Database with basic query implementation, but doesn't test real SQL queries or error conditions.

### Implementation Coupling
- **api.test.ts:19-60**: Mocks internal modules like '../ingest/sources-registry' instead of testing through public APIs. Changes to internal structure break tests unnecessarily.
- **hooks.test.ts:9-13**: Tests pure logic functions extracted from hooks, which is good, but doesn't test the hook integration with React state.

### Hardcoded Mock Values
- **api.test.ts:27-32**: Mock service returns fixed payload, doesn't test dynamic data or error conditions.
- **multi-project.test.ts:18-23**: Mock getSnapshot returns static data, doesn't test store behavior over time.

## Test Isolation Problems

### Shared State in Hooks Tests
- **hooks.test.ts**: Tests pure functions but doesn't verify hook behavior in React context. No tests for useEffect cleanup or state persistence.

### E2E Test Dependencies
- **dashboard.spec.ts**: Uses mock API endpoints, which is good for isolation, but doesn't test real backend integration.

## Assertion Quality Issues

### Brittle Assertions
- **api.test.ts:145**: Asserts exact version string '1.0.0-test' which is hardcoded and may change.
- **multi-project.test.ts:84-86**: Asserts exact pollIntervalMs value without testing the source of truth.

### Missing Negative Assertions
- **api.test.ts**: Tests successful API calls but no tests for malformed requests, invalid JSON, or server errors.
- **per-session-timeseries.test.ts**: Tests successful derivation but no tests for invalid project paths or database errors beyond one case.

### Tests That Always Pass
- **hooks.test.ts:16-38**: Threshold tests are good, but don't test edge cases like negative numbers or non-integer inputs.
- **per-session-timeseries.test.ts:36-51**: Tests output shape but doesn't validate actual data correctness.

## Test Naming Issues

### Generic Names
- **api.test.ts**: Test names like 'GET /health returns 200' are clear but could be more descriptive of what they're verifying.
- **multi-project.test.ts**: 'returns ProjectSnapshot with correct shape' doesn't specify which fields are critical.

### Missing Context
- **hooks.test.ts**: 'returns comfortable for 0 projects' doesn't explain why 0 projects should be comfortable.

## Flaky Patterns

### Timing Dependencies in E2E
- **dashboard.spec.ts:229**: Uses waitForTimeout(3500) for polling cycle, which is brittle and may fail on slow CI.
- **dashboard.spec.ts:196-208**: Theme toggle tests assume initial theme state without resetting.

### No Race Condition Tests
- No tests for concurrent API calls, rapid state changes, or component unmounting during async operations.

## Missing Test Categories

### No Accessibility Tests
- No tests for keyboard navigation, screen reader support, or ARIA attributes.

### No Performance Tests
- No tests for rendering performance with 10+ projects, memory leaks, or large time series data.

### No Visual Regression Tests
- No snapshot tests for UI components to catch unintended visual changes.

### No Error Recovery Tests
- No tests for component error boundaries, API retry logic, or graceful degradation.

### No Cross-Browser Tests
- Playwright config only tests Chromium, no Firefox/Safari coverage.

## Specific File Issues

### api.test.ts
- Lines 8-61: Excessive mocking hides real functionality
- Line 203: Tests invalid session ID but doesn't test other validation failures
- Missing tests for: POST/PUT/DELETE methods, CORS, rate limiting, malformed JSON

### multi-project.test.ts  
- Lines 119-146: Tests error isolation but only for one failing source among many
- Missing tests for: cache invalidation, store cleanup, concurrent access

### per-session-timeseries.test.ts
- Lines 104-117: Only tests one SQLite error case (unable to open)
- Missing tests for: partial data corruption, query timeouts, large result sets

### hooks.test.ts
- Good isolation of pure logic, but missing React integration tests
- No tests for localStorage failures or quota exceeded

### dashboard.spec.ts
- Lines 229, 3500ms timeout is flaky
- Missing tests for: mobile viewport, accessibility, error states in UI

## Recommendations (Not Requested)
While not asked to suggest fixes, the analysis reveals critical gaps in testing the core data ingestion and UI rendering logic that could lead to production bugs.
