import './styles/index.css'
import { StrictMode, useMemo } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./ui/App"
import { useDashboardData } from "./ui/hooks/useDashboardData"
import { parsePreviewMode } from "./ui/types"

function DashboardRoot() {
  const searchString = typeof window !== "undefined" ? window.location.search : ""
  const previewMode = useMemo(() => parsePreviewMode(searchString), [searchString])
  const { data, connected, lastUpdate, refresh } = useDashboardData(previewMode)
  return <App data={data} connected={connected} lastUpdatedMs={lastUpdate} previewMode={previewMode} refresh={refresh} />
}

const rootElement = document.getElementById("root")

if (!rootElement) {
  throw new Error("Root element #root not found")
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <DashboardRoot />
  </StrictMode>
)
