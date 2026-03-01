import { useState, useCallback, useEffect } from "react"
import { StripConfigState } from "../../types"

const STORAGE_KEY = "dashboard-strip-config"

/** Default strip configuration with all toggles enabled */
const DEFAULT_CONFIG: StripConfigState = {
  showMiniSparkline: true,
  showPlanProgress: true,
  showAgentBadge: true,
  showLastUpdated: true,
  showStatusDot: true,
  showTokenUsage: true,
  showBackgroundTasks: true,
  showGitWorktrees: true,
}

/** Read persisted strip config from localStorage, returning defaults on failure */
function readPersistedConfig(): StripConfigState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return DEFAULT_CONFIG
  }
}

/** Persist strip config to localStorage, silently failing if unavailable */
function persistConfig(config: StripConfigState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* localStorage may be unavailable (private browsing, quota exceeded) */
  }
}

/**
 * Manages which elements appear in the collapsed project strip.
 * State is persisted to localStorage so configuration survives page reloads.
 */
export function useStripConfig(): {
  config: StripConfigState
  toggle: (key: keyof StripConfigState) => void
  reset: () => void
} {
  const [config, setConfig] = useState<StripConfigState>(() => readPersistedConfig())

  /* Persist to localStorage whenever config changes */
  useEffect(() => {
    persistConfig(config)
  }, [config])

  const toggle = useCallback((key: keyof StripConfigState) => {
    setConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }, [])

  const reset = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
  }, [])

  return { config, toggle, reset }
}
