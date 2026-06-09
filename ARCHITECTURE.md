# Astrix AI v2 - Architecture Overview

Technical architecture and design decisions for Astrix AI v2 desktop application.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ASTRIX AI v2                              │
├─────────────────────────────────────────────────────────────┤
│                    ELECTRON SHELL                            │
├─────────────────┬───────────────────┬──────────────────────┤
│   MAIN PROCESS  │  RENDERER PROCESS │  PRELOAD BRIDGE      │
├─────────────────┼───────────────────┼──────────────────────┤
│ • Window Mgmt   │ • React 18 App    │ • Context Isolation  │
│ • IPC Handlers  │ • React Router    │ • API Exposure       │
│ • Config Store  │ • State Mgmt      │ • Window Control     │
│ • App Menu      │ • Components      │ • Gateway Comm       │
└─────────────────┴───────────────────┴──────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
    ┌────────┐    ┌────────────┐   ┌──────────┐
    │  IPC   │    │   Hooks    │   │   API    │
    │Channels│    │  (State)   │   │  Client  │
    └────────┘    └────────────┘   └──────────┘
                         │
                ┌────────▼────────┐
                │  BACKEND API    │
                │ (http://...)    │
                └─────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
    ┌─────────┐   ┌──────────┐   ┌──────────────┐
    │ Auth    │   │ Smart    │   │ Chat/Voice   │
    │ Service │   │ Home     │   │ Gateway      │
    └─────────┘   └──────────┘   └──────────────┘
```

## Technology Stack

### Frontend (Renderer)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **UI Framework** | React 18 | Component-based UI |
| **Router** | React Router v6 | Client-side routing |
| **Language** | TypeScript | Type safety |
| **Build Tool** | Vite 5 | Fast bundling |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **HTTP Client** | Axios | API requests |
| **Animations** | Framer Motion | Smooth transitions |
| **Notifications** | React Hot Toast | Toast messages |
| **Icons** | React Icons | SVG icons |

### Desktop (Electron)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Desktop Framework** | Electron 27 | Native window/system |
| **IPC Communication** | Electron IPC | Process bridging |
| **Context Isolation** | Electron Security | Sandboxed renderer |
| **Window Manager** | Electron BrowserWindow | App windows |
| **Packaging** | electron-builder | Installers/distribution |

### Build & Development

| Tool | Purpose |
|------|---------|
| **TypeScript** | Type checking |
| **PostCSS** | CSS processing |
| **Autoprefixer** | CSS prefixes |
| **Git** | Version control |

## Directory Structure

### Src/ Organization

```
src/
├── main/                          # Electron main process
│   ├── main.ts                   # Window creation, IPC handlers
│   └── preload.ts                # Context bridge
│
├── renderer/                      # React application
│   ├── main.tsx                  # React + Router setup
│   └── App.tsx                   # Root placeholder
│
├── components/                    # React components
│   ├── Layout.tsx                # Header/nav/footer wrapper
│   ├── Login.tsx                 # Auth page
│   ├── Dashboard.tsx             # Home/overview
│   ├── Chat.tsx                  # AI chat interface
│   ├── SmartHome.tsx             # Device control
│   ├── Admin.tsx                 # User management
│   └── index.ts                  # Barrel export
│
├── hooks/                         # Custom React hooks
│   ├── useAuth.ts                # Authentication state
│   ├── useSmartHome.ts           # Smart home control
│   ├── useVoice.ts               # Voice I/O
│   └── index.ts
│
├── api/                           # HTTP client layer
│   ├── client.ts                 # Axios instance + endpoints
│   └── index.ts
│
├── types/                         # TypeScript definitions
│   └── index.ts                  # All interfaces & types
│
├── utils/                         # Utility functions
│   ├── errorHandler.ts           # Error handling
│   ├── helpers.ts                # General helpers
│   └── index.ts
│
└── styles/                        # Global styles
    └── globals.css               # Tailwind + custom CSS
```

## Component Hierarchy

```
Layout
├── Header
│   ├── Logo + Brand
│   ├── Navigation (desktop)
│   ├── User Info + Logout
│   └── Mobile Menu Toggle
├── Main Content
│   ├── Login (public route)
│   ├── Dashboard (protected)
│   │   ├── Welcome Section
│   │   ├── Quick Stats
│   │   └── Feature Cards
│   ├── Chat (protected)
│   │   ├── Message History
│   │   ├── User Input
│   │   └── Voice Controls
│   ├── SmartHome (protected)
│   │   └── Light Grid
│   │       ├── Light Card
│   │       └── Controls
│   └── Admin (protected + admin role)
│       ├── User Form
│       ├── User Table
│       └── Statistics
└── Footer
```

## Data Flow

### Authentication Flow

```
Login Page
    ↓
User enters credentials
    ↓
useAuth.login(username, password)
    ↓
apiClient.login() → POST /auth/login
    ↓
Backend validates → Returns { user, token }
    ↓
localStorage.setItem('auth_token', token)
localStorage.setItem('auth_user', JSON.stringify(user))
    ↓
Update authState in React
    ↓
Navigate to /dashboard
```

### Smart Home Control Flow

```
SmartHome Component
    ↓
useSmartHome() initializes on mount
    ↓
fetchHueLights() → GET /smart-home/hue/lights
    ↓
Display Light Grid
    ↓
User clicks toggle button
    ↓
handleToggleLight(light)
    ↓
controlLight(lightId, { on: !light.state.on })
    ↓
apiClient.controlHueLight(lightId, state) → PUT /lights/:id
    ↓
Update local state optimistically
    ↓
Display toast notification
```

### Chat Flow

```
Chat Component
    ↓
User types message + hits send
    ↓
handleSendMessage()
    ↓
Add message to local state (optimistic)
    ↓
apiClient.sendMessage(sessionId, content) → POST /chat/:sessionId/messages
    ↓
Receive response with assistant message
    ↓
Add to messages state
    ↓
Auto-scroll to bottom
    ↓
User sees conversation history
```

## State Management Strategy

### Local Component State
```tsx
// Simple, local-only state
const [isOpen, setIsOpen] = useState(false)
const [input, setInput] = useState('')
```

### Hook-Based State (Recommended)
```tsx
// Encapsulated logic + state in custom hooks
const { user, isAuthenticated, login, logout } = useAuth()
const { devices, controlLight } = useSmartHome()
```

### Component Props
```tsx
// Pass data through component tree
<Dashboard user={user} onLogout={logout} />
```

**Why this approach:**
- ✅ Minimal re-renders
- ✅ Encapsulated logic
- ✅ Easy testing
- ✅ No external state library needed initially
- ✅ Can add Zustand/Redux if needed later

## API Client Architecture

### Axios Instance

```tsx
// src/api/client.ts
const instance = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})
```

### Request Interceptor
```tsx
// Adds auth token to every request
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

### Response Interceptor
```tsx
// Handles 401 errors globally
instance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

## Security Architecture

### Electron Security

```tsx
// Main Process - Restricted
mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // ✅ Isolate contexts
    nodeIntegration: false,      // ✅ No Node.js in renderer
    enableRemoteModule: false,   // ✅ No remote module
    sandbox: true,               // ✅ Sandboxed renderer
    preload: preloadPath         // ✅ Safe IPC bridge
  }
})
```

### Context Bridge (Preload)

```tsx
// Exposes safe APIs to renderer
const electronAPI = {
  window: { minimize, maximize, close },
  gateway: { send, on, off },
  config: { get, set },
  system: { getVersion, getPlatform }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
```

### Authentication Security

```tsx
// JWT tokens stored in localStorage
// Automatically sent with every API request
// Auto-removed on 401
// Protected routes redirect to /login
```

## Performance Optimizations

### Code Splitting
```tsx
// Vite automatically splits by route
// Smaller bundles loaded on-demand
// Faster initial load
```

### Component Memoization
```tsx
// Prevent unnecessary re-renders
const MemoizedComponent = React.memo(Component)

// Or within component
const memoizedValue = useMemo(() => expensive(), [deps])
```

### Lazy Loading
```tsx
// React Router lazy loading
const Dashboard = lazy(() => import('./Dashboard'))

// Image lazy loading
<img loading="lazy" src="..." />
```

### API Request Optimization
```tsx
// Axios request deduplication
// Automatic retries with exponential backoff
// Response caching in localStorage when needed
```

## Build Output Structure

### Development
```
dist/
├── main/
│   ├── main.js           # Compiled main process
│   └── preload.js        # Compiled preload
└── renderer/
    ├── index.html        # HTML template
    ├── assets/
    │   ├── index-*.js    # Bundled JS
    │   └── index-*.css   # Bundled CSS
    └── vite.svg          # Assets
```

### Production (Packaged)
```
Astrix AI Setup.exe
├── $PLUGINSDIR/
├── Astrix AI/
│   ├── astrix-ai.exe     # App executable
│   ├── resources/
│   │   └── app/
│   │       ├── main.js
│   │       ├── preload.js
│   │       └── dist/     # React bundle
│   ├── LICENSE.electron.txt
│   └── LICENSES.chromium.html
```

## IPC Communication Protocol

### Window Control

```tsx
// Renderer → Main
window.electronAPI.window.minimize()
window.electronAPI.window.maximize()
window.electronAPI.window.close()

// Main → Renderer (events)
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
```

### Config Persistence

```tsx
// Renderer → Main (get)
const apiUrl = await window.electronAPI.config.get('backendUrl')

// Renderer → Main (set)
await window.electronAPI.config.set('backendUrl', 'http://...')

// Main ↔ File
readConfig() // Read from userData/config.json
writeConfig(config) // Write to userData/config.json
```

### Gateway Communication (Future)

```tsx
// Extensible IPC for custom features
window.electronAPI.gateway.send('feature:action', data)
window.electronAPI.gateway.on('feature:response', (data) => {})
```

## Type Safety

### Shared Type Definitions

```tsx
// src/types/index.ts - Single source of truth
interface User { id, username, email, role, ... }
interface ChatMessage { id, sender, content, timestamp, ... }
interface HueLight { id, name, state, type, ... }
```

### API Response Wrapper

```tsx
// Consistent API response structure
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
}
```

### Component Props

```tsx
// Type-safe props
interface DashboardProps {
  user: User
  isLoading: boolean
  onRefresh: () => void
}
```

## Error Handling Strategy

### Global Error Handler
```tsx
// Catch and format all API errors
function handleApiError(error: unknown): ApiError {
  // Extract message, code, status
  // Return normalized ApiError
}
```

### User-Facing Notifications
```tsx
// Toast notifications for errors
toast.error('Failed to save settings')
toast.success('Saved successfully')
```

### Console Logging
```tsx
// Development debugging
console.log('[API] Request:', config)
console.error('[ERROR] Failed to load:', error)
```

## Extensibility Points

### Add New Pages

1. Create component in `src/components/`
2. Add route in `src/renderer/main.tsx`
3. Add navigation link in `Layout.tsx`

### Add New API Endpoints

1. Add method to `src/api/client.ts`
2. Create custom hook if needed
3. Use in components

### Add Custom Hooks

1. Create `src/hooks/useFeature.ts`
2. Export from `src/hooks/index.ts`
3. Use in components

### Add Smart Home Device Type

1. Update types in `src/types/index.ts`
2. Add API methods to `src/api/client.ts`
3. Create component for device UI

---

## Technology Rationale

### Why Electron?
- Native desktop experience
- Cross-platform support (Windows, macOS, Linux)
- Access to system features
- Offline capability

### Why React + TypeScript?
- Component reusability
- Type safety
- Large ecosystem
- Developer experience

### Why Tailwind CSS?
- Utility-first approach
- Fast styling
- Consistent design system
- Minimal CSS output

### Why Vite?
- Blazing fast development
- Modern ES modules
- Optimized production build
- Great DX

### Why Axios?
- Simple, intuitive API
- Request/response interceptors
- Built-in request cancellation
- Widely adopted

---

## Deployment Pipeline

```
Source Code (Git)
    ↓
npm install
    ↓
Type Checking (tsc)
    ↓
Build (tsc + vite)
    ↓
Compiled Output (dist/)
    ↓
electron-builder
    ↓
Windows Installer (.exe)
    ↓
Portable (.exe)
    ↓
GitHub Release
    ↓
User Download
```

---

**This architecture provides a solid, scalable foundation for Astrix AI v2!** ✨
