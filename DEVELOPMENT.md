# Astrix AI v2 - Development Guide

Complete reference for developing, extending, and maintaining Astrix AI v2.

## Table of Contents

1. [Setup & Installation](#setup--installation)
2. [Development Workflow](#development-workflow)
3. [Project Architecture](#project-architecture)
4. [Component Guide](#component-guide)
5. [API Integration](#api-integration)
6. [State Management](#state-management)
7. [Styling & UI](#styling--ui)
8. [Build & Distribution](#build--distribution)
9. [Testing](#testing)
10. [Debugging](#debugging)
11. [Common Tasks](#common-tasks)

---

## Setup & Installation

### Prerequisites

- **Node.js**: 18.0.0 or higher
- **npm**: 9.0.0 or higher
- **Git**: Latest version
- **Windows**: Windows 10 or later (for packaging)

### Initial Setup

```bash
# Clone the repository
cd Astrix-AI-v2

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your configuration
VITE_API_URL=http://localhost:3000
```

### Verify Installation

```bash
# Check Node version
node --version  # Should be 18+

# Check dependencies installed
npm ls --depth=0

# Type check
npm run type-check
```

---

## Development Workflow

### Start Development Server

```bash
# Runs Vite dev server + Electron in parallel
npm run dev

# This will:
# - Start Vite dev server on http://localhost:5173
# - Wait for server to be ready
# - Launch Electron and load dev server
# - Open DevTools automatically
```

### Hot Module Replacement (HMR)

Vite provides automatic HMR for React components:

```tsx
// Edit src/components/Dashboard.tsx
// Changes appear instantly in running Electron window
// Component state is preserved
```

### Code Quality

```bash
# Type checking (no output = all good)
npm run type-check

# Fix TypeScript errors before committing
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/chat-improvements

# Make changes, commit frequently
git add .
git commit -m "Add voice input validation"

# Push and create PR
git push origin feature/chat-improvements
```

---

## Project Architecture

### Directory Structure

```
Astrix-AI-v2/
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.ts        # Window mgmt, IPC handlers
│   │   └── preload.ts     # Context isolation bridge
│   │
│   ├── renderer/           # React app entry point
│   │   ├── main.tsx       # React + React Router setup
│   │   └── App.tsx        # Root component (placeholder)
│   │
│   ├── components/         # React components
│   │   ├── Layout.tsx     # Main layout wrapper
│   │   ├── Login.tsx      # Auth page
│   │   ├── Dashboard.tsx  # Home page
│   │   ├── Chat.tsx       # AI chat interface
│   │   ├── SmartHome.tsx  # Device control
│   │   ├── Admin.tsx      # User management
│   │   └── index.ts       # Barrel export
│   │
│   ├── hooks/              # Custom React hooks
│   │   ├── useAuth.ts     # Auth state & methods
│   │   ├── useSmartHome.ts # Device control
│   │   ├── useVoice.ts    # Voice features
│   │   └── index.ts
│   │
│   ├── api/                # HTTP client
│   │   ├── client.ts      # Axios instance + methods
│   │   └── index.ts
│   │
│   ├── types/              # TypeScript definitions
│   │   └── index.ts
│   │
│   ├── utils/              # Utility functions
│   │   ├── errorHandler.ts
│   │   ├── helpers.ts
│   │   └── index.ts
│   │
│   └── styles/
│       └── globals.css    # Tailwind + custom CSS
│
├── public/                 # Static assets
│   └── icon.svg           # App icon
│
├── vite.config.ts         # Vite + React plugin setup
├── tailwind.config.js     # Tailwind customization
├── postcss.config.js      # PostCSS plugins
├── tsconfig.json          # TypeScript config (renderer)
├── tsconfig.node.json     # TypeScript config (build tools)
├── tsconfig.main.json     # TypeScript config (main process)
├── package.json           # Dependencies & scripts
├── index.html             # HTML template
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
├── README.md              # User documentation
└── DEVELOPMENT.md         # This file
```

### Data Flow

```
┌─────────────────────────────────────┐
│      React Components               │
│  (Dashboard, Chat, SmartHome, etc) │
└──────────────┬──────────────────────┘
               │
      ┌────────▼────────┐
      │  Custom Hooks   │
      │  useAuth, etc   │
      └────────┬────────┘
               │
      ┌────────▼──────────────┐
      │   API Client          │
      │   (axios instance)    │
      └────────┬──────────────┘
               │
      ┌────────▼──────────────┐
      │  Backend API          │
      │  (http://localhost) │
      └───────────────────────┘

IPC Bridge (Electron):
┌─────────────────────────────────┐
│  Renderer (React/Window)         │
│  ├─ Context isolation bridge     │
│  ├─ electronAPI object           │
│  └─ IPC messages                 │
├─────────────────────────────────┤
│  Main Process (Electron)         │
│  ├─ Window management            │
│  ├─ IPC handlers                 │
│  ├─ Config persistence           │
│  └─ System integration           │
└─────────────────────────────────┘
```

---

## Component Guide

### Layout Component

Main app wrapper with navigation.

```tsx
// src/components/Layout.tsx
- Header with logo, nav, user menu
- Mobile hamburger menu
- Logout button
- Footer
- Outlet for child routes
```

**Usage:**
```tsx
<Layout>
  <Dashboard />  {/* Rendered at <Outlet /> */}
</Layout>
```

### Login Component

Authentication page.

```tsx
// src/components/Login.tsx
- Username/email input
- Password input
- Login button with loading state
- Form validation
- Toast notifications
```

**Key Functions:**
```tsx
const { login } = useAuth()
const success = await login(username, password)
```

### Dashboard Component

Home page with feature overview.

```tsx
// src/components/Dashboard.tsx
- Welcome greeting
- Quick stats (Role, Status, Version)
- Feature cards with links
- Staggered animations
- Info box/tips
```

### Chat Component

AI conversation interface.

```tsx
// src/components/Chat.tsx
- Message history (user & assistant)
- Text input with send button
- Voice recording button
- Message timestamps
- Voice playback for responses
- Loading indicator
```

**Key Features:**
- Session management
- Voice transcription (Whisper)
- Voice synthesis (ElevenLabs)
- Real-time message updates

### SmartHome Component

Device control interface.

```tsx
// src/components/SmartHome.tsx
- Hue light grid
- Toggle on/off
- Brightness slider
- Status indicators
- Device selection
- Empty state
```

**Device Control:**
```tsx
const { controlLight } = useSmartHome()
await controlLight(lightId, { on: true, bri: 200 })
```

### Admin Component

User management dashboard.

```tsx
// src/components/Admin.tsx
- User list table
- Create user form
- Edit/delete buttons
- User statistics
- Role management
```

**CRUD Operations:**
```tsx
const { getUsers, deleteUser, register } = apiClient
```

---

## API Integration

### API Client Architecture

```tsx
// src/api/client.ts
const apiClient = new ApiClient('http://localhost:3000')

// Automatically includes auth token
apiClient.setToken(jwtToken)

// Auto handles 401 redirects
// Request/response interceptors
```

### Making API Calls

```tsx
// In components or hooks
const response = await apiClient.sendMessage(sessionId, content)

if (response.success && response.data) {
  // Handle success
} else {
  // Handle error
}
```

### Error Handling

```tsx
import { handleApiError, isNetworkError, isAuthError } from '@utils'

try {
  await apiClient.login(username, password)
} catch (error: unknown) {
  const apiError = handleApiError(error)
  
  if (isNetworkError(error)) {
    // Network connectivity issue
  } else if (isAuthError(error)) {
    // 401 Unauthorized (auto-redirected)
  } else {
    console.error(apiError.message)
  }
}
```

### Adding New Endpoints

```tsx
// In src/api/client.ts
async getSmartHomeStatus(): Promise<ApiResponse<any>> {
  return this.instance.get('/smart-home/status')
}

// In components
const response = await apiClient.getSmartHomeStatus()
```

---

## State Management

### Auth State (useAuth)

```tsx
const {
  user,           // Current user object
  token,          // JWT token
  isAuthenticated, // Boolean
  isLoading,      // Loading state
  error,          // Error message
  login,          // (username, password) => Promise<boolean>
  logout,         // () => Promise<void>
  register,       // (username, email, password) => Promise<boolean>
} = useAuth()
```

### Smart Home State (useSmartHome)

```tsx
const {
  devices,        // SmartHomeDevice[]
  hueLights,      // HueLight[]
  isLoading,
  error,
  fetchDevices,   // () => Promise<void>
  fetchHueLights, // () => Promise<void>
  controlLight,   // (id, state) => Promise<boolean>
  controlDevice,  // (id, action) => Promise<boolean>
  activateScene,  // (sceneId) => Promise<boolean>
} = useSmartHome()
```

### Voice State (useVoice)

```tsx
const {
  isRecording,     // Boolean
  isProcessing,    // Boolean
  error,           // Error message
  startRecording,  // () => Promise<void>
  stopRecording,   // () => Promise<string | null>
  synthesizeVoice, // (text) => Promise<Blob | null>
} = useVoice()
```

### Local Storage

```tsx
// Auth tokens stored in localStorage
localStorage.setItem('auth_token', jwtToken)
localStorage.setItem('auth_user', JSON.stringify(user))

// Cleared on logout
localStorage.removeItem('auth_token')
localStorage.removeItem('auth_user')
```

---

## Styling & UI

### Tailwind CSS

```tsx
// Global colors defined in tailwind.config.js
// primary: Purple gradient
// secondary: Orange gradient

// Custom utilities
className="bg-gradient-primary"  // Purple/Orange gradient
className="card"                  // Custom card style
className="glass"                 // Glass morphism
className="btn-primary"           // Button style
```

### Animation Classes

```tsx
// Custom animations from globals.css
className="animate-fade-in"   // Fade in
className="animate-slide-up"  // Slide up
className="pulse"             // Pulse effect
```

### Using Framer Motion

```tsx
import { motion } from 'framer-motion'

// Simple animation
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
  Content
</motion.div>

// Staggered children
<motion.div
  variants={containerVariants}
  initial="hidden"
  animate="visible"
>
  {items.map(item => (
    <motion.div key={item.id} variants={itemVariants}>
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

### Responsive Design

```tsx
// Tailwind responsive classes
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
className="hidden md:flex"
className="px-4 sm:px-6 lg:px-8"
```

---

## Build & Distribution

### Development Build

```bash
npm run dev
# Combines:
# - Vite dev server (port 5173)
# - TypeScript watch (main process)
# - Electron auto-reload
```

### Production Build

```bash
# Full build pipeline
npm run build

# Compiles:
# - TypeScript (renderer + main)
# - Vite bundle (React app)
# - Creates optimized dist/
```

### Create Windows Installer

```bash
npm run dist

# Uses electron-builder to create:
# - Portable .exe
# - NSIS installer (.exe setup)
# - Unpacked directory

# Output in release/
```

### Build Configuration

```javascript
// package.json
"build": {
  "appId": "com.astrixai.v2",
  "productName": "Astrix AI",
  "files": [
    "dist/**/*",
    "node_modules/**/*",
    "package.json"
  ],
  "win": {
    "target": ["nsis", "portable"]
  }
}
```

---

## Testing

### Type Checking

```bash
# Full TypeScript check
npm run type-check

# Watch mode (during development)
tsc --watch
```

### Manual Testing Checklist

**Auth Flow:**
- [ ] Login with valid credentials
- [ ] Reject invalid credentials
- [ ] Token stored in localStorage
- [ ] Logout clears token
- [ ] Protected routes redirect to login

**Chat Interface:**
- [ ] Send text message
- [ ] Receive response
- [ ] Voice recording starts/stops
- [ ] Transcription works
- [ ] Voice playback works
- [ ] Session history loads

**Smart Home:**
- [ ] Lights list loads
- [ ] Toggle light on/off
- [ ] Brightness slider works
- [ ] Status updates
- [ ] Error handling for offline devices

**Admin Panel:**
- [ ] User list displays
- [ ] Create user form works
- [ ] Delete user prompts confirmation
- [ ] Permissions enforced (admin only)

**Electron:**
- [ ] Window controls work (minimize, maximize, close)
- [ ] DevTools toggle
- [ ] Application menu functions
- [ ] Config persistence

---

## Debugging

### Chrome DevTools

Open in running Electron window:

```
Ctrl+Shift+I (Windows/Linux)
Cmd+Option+I (macOS)
```

**Tabs:**
- **Console**: Logs, errors, REPL
- **Sources**: Code, breakpoints
- **Network**: API requests
- **Application**: LocalStorage, cookies
- **Elements**: DOM tree

### React DevTools

Requires `@react-devtools/shell`:

```bash
npm install --save-dev @react-devtools/shell
```

### Common Debug Patterns

```tsx
// Log component renders
console.log('Dashboard rendered', props)

// Log state changes
useEffect(() => {
  console.log('Auth state:', authState)
}, [authState])

// Network request logging
this.instance.interceptors.request.use(config => {
  console.log('API Request:', config)
  return config
})

// API response logging
this.instance.interceptors.response.use(response => {
  console.log('API Response:', response.data)
  return response.data
})
```

### IPC Debug Logging

```tsx
// src/main/main.ts
ipcMain.handle('config:get', (_, key) => {
  console.log('[IPC] config:get', key)
  const config = readConfig()
  console.log('[IPC] config result:', config[key])
  return config[key]
})
```

### Environment Debugging

```bash
# Print all environment variables
console.log(import.meta.env)

# Check if in dev mode
if (import.meta.env.DEV) {
  console.log('Development mode')
}
```

---

## Common Tasks

### Add a New Page

```tsx
// 1. Create component in src/components/NewPage.tsx
export function NewPage() {
  return <div>New page</div>
}

// 2. Add to components/index.ts
export { NewPage } from './NewPage'

// 3. Add route in src/renderer/main.tsx
<Route path="/new-page" element={<ProtectedRoute><NewPage /></ProtectedRoute>} />

// 4. Add navigation link in Layout.tsx
const navItems = [
  // ... existing items
  { label: 'New Page', path: '/new-page' },
]
```

### Add API Endpoint

```tsx
// 1. Add method to src/api/client.ts
async getNewData(): Promise<ApiResponse<any>> {
  return this.instance.get('/new-endpoint')
}

// 2. Use in component/hook
const response = await apiClient.getNewData()
```

### Add Custom Hook

```tsx
// 1. Create src/hooks/useNewFeature.ts
export function useNewFeature() {
  const [state, setState] = useState(null)
  
  useEffect(() => {
    // Initialize
  }, [])
  
  return { state }
}

// 2. Export from src/hooks/index.ts
export { useNewFeature } from './useNewFeature'

// 3. Use in component
const { state } = useNewFeature()
```

### Update Styling

```tsx
// 1. Modify Tailwind classes directly
className="bg-purple-600 hover:bg-purple-700"

// 2. Add custom CSS to src/styles/globals.css
@layer components {
  .custom-button {
    @apply px-4 py-2 rounded-lg font-semibold;
  }
}

// 3. Use custom class
className="custom-button"
```

### Handle API Errors

```tsx
try {
  await apiClient.sendMessage(sessionId, content)
} catch (error: any) {
  const { message, code, status } = handleApiError(error)
  
  switch (code) {
    case 'HTTP_400':
      toast.error('Invalid request')
      break
    case 'HTTP_401':
      // Auto-redirected by interceptor
      break
    case 'HTTP_500':
      toast.error('Server error')
      break
    default:
      toast.error(message)
  }
}
```

### Add Protected Route

```tsx
// Wrap component with ProtectedRoute
<Route
  path="/admin"
  element={
    <ProtectedRoute>
      <Admin />
    </ProtectedRoute>
  }
/>

// ProtectedRoute redirects to /login if not authenticated
```

---

## Performance Optimization

### Code Splitting

Vite automatically code-splits by route.

### Memoization

```tsx
import { useMemo, useCallback } from 'react'

// Memoize expensive calculations
const memoizedValue = useMemo(() => expensiveCalculation(data), [data])

// Memoize callbacks
const handleClick = useCallback(() => {
  // Handle click
}, [dependencies])
```

### Image Optimization

```tsx
// Use optimized images
<img src="/image.webp" alt="Description" />
```

---

## Useful Resources

- [React Documentation](https://react.dev)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Framer Motion](https://www.framer.com/motion)

---

## Getting Help

1. Check console errors (Ctrl+Shift+I)
2. Review README.md for architecture
3. Check existing components for patterns
4. Read TypeScript error messages carefully
5. Test API connection independently

---

**Happy coding! 🚀✨**
