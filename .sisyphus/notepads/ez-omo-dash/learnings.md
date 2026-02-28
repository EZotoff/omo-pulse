# ez-omo-dash Scaffold Learnings

## Project Setup (Task 1)
- **Port**: Uses `EZ_DASH_API_PORT` env var, defaults to 51244 (not 51234 which is reference dashboard)
- **Dependencies**: Exact versions from requirements, installed successfully with Bun v1.2.16
- **Build**: Vite builds cleanly, TypeScript strict mode passes without issues
- **Architecture**: 
  - Bun+Hono for backend, React 18 for frontend
  - Dev mode: Hono dev server + Vite dev server (parallel)
  - Prod mode: Static SPA serving from dist/ via Bun.serve
  
## Key Files
- `vite.config.ts`: Defines `__APP_VERSION__` global from package.json, proxies /api to backend
- `src/server/dev.ts`: Lightweight dev API server (no static serving, Vite handles it)
- `src/server/start.ts`: Production server with SPA fallback middleware for static files
- `src/app-version.d.ts`: Global type declaration for __APP_VERSION__

## Build Outputs
- `dist/` directory created with index.html and minified JS bundles
- Gzip sizes: 0.44 KB (HTML), 45.74 KB (JS)

## Verification Passed
✓ `bun install` - 133 packages
✓ `bunx tsc --noEmit` - no errors
✓ `bun run build` - Vite build successful
✓ `bun run src/server/dev.ts` - server starts on 127.0.0.1:51244
