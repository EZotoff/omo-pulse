# GitHub Copilot Review Output Format

When reviewing code, include structured tokens in your review output and scorecard.

## Review Finding Format

For each finding in inline comments, use:

```
[SEVERITY:critical|warning|info|nit] [DIM:security|safety|performance|featureQuality]

Brief finding summary and explanation.
```

## Review Body Format

In the review summary, include:

```
[RISK:low|medium|high]

[SCORES]
{"security": N, "safety": N, "performance": N, "featureQuality": N, "confidence": N}
[/SCORES]

[SUMMARY]
Overall assessment text.
[/SUMMARY]
```

## Token Definitions

**Severity** (use in inline comments):
- `critical`: Blocks deployment or causes runtime failure
- `warning`: Significant issue before merge
- `info`: Minor improvement or best practice
- `nit`: Stylistic or cosmetic comment

**Dimensions** (0-5 scores):
- `security`: Vulnerabilities, authentication, authorization, encryption
- `safety`: Runtime errors, crashes, undefined behavior, null safety
- `performance`: Efficiency, memory usage, algorithmic complexity
- `featureQuality`: Correctness, maintainability, API design, test coverage

**Risk Levels**:
- `low`: Minimal impact if not addressed
- `medium`: Moderate impact, should be fixed in release
- `high`: Major risk, must be addressed before deployment

**Scores** (0-5 scale):
- All fields required: `security`, `safety`, `performance`, `featureQuality`, `confidence`
- Values: integers or decimals from 0 to 5
- `confidence`: your confidence in the score assessment

## Example Review

Inline comment:
```
[SEVERITY:critical] [DIM:security]

SQL injection vulnerability: user input is concatenated directly into SQL queries.
Use parameterized queries or prepared statements.
```

Review body:
```
[RISK:high]

[SCORES]
{"security": 1, "safety": 2, "performance": 4, "featureQuality": 3, "confidence": 5}
[/SCORES]

[SUMMARY]
Critical security issue must be fixed before merge. Inject safe query patterns.
[/SUMMARY]
```
