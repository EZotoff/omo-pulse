export type ReviewDimension = "security" | "safety" | "performance" | "featureQuality"

export type ReviewSeverity = "info" | "warning" | "critical"

export type ReviewFindingConfidence = "low" | "medium" | "high"

export type ReviewRiskLevel = "low" | "medium" | "high"

export type ReviewFinding = {
  dimension: ReviewDimension
  severity: ReviewSeverity
  confidence: ReviewFindingConfidence
  summary: string
  file?: string
  line?: number
  suggestion?: string
}

export type ReviewScores = {
  security: number
  safety: number
  performance: number
  featureQuality: number
  confidence: number
}

export type ReviewScorecard = {
  summary?: string
  source?: string
  scores: ReviewScores
  risk: ReviewRiskLevel
  autoApproveAllowed: boolean
  findings: ReviewFinding[]
}

export type ReviewPolicyDecision = "block" | "request_fixes" | "auto_approve"

export type ReviewPolicyResult = {
  decision: ReviewPolicyDecision
  summary: string
  reasons: string[]
  blocked: boolean
  autoApprove: boolean
  compositeScore: number
  scores: ReviewScores
  risk: ReviewRiskLevel
  autoApproveAllowed: boolean
}
