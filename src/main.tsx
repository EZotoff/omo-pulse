import './styles/index.css'
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./ui/App"
import { useDashboardData } from "./ui/hooks/useDashboardData"

function DashboardRoot() {
  const { data, connected, lastUpdate, errorHint } = useDashboardData()
  return <App data={data} connected={connected} lastUpdatedMs={lastUpdate} />
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DashboardRoot />
  </StrictMode>
)
