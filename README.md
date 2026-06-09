# Astrix AI v2 - Windows Desktop Application

A modern, feature-rich desktop application built with Electron, React, and TypeScript. Control your smart home, chat with an AI assistant, manage users, and more.

## Features

✨ **Smart Features**
- **AI Chat Interface** - Talk to Astrix with text or voice
- **Smart Home Control** - Manage Hue lights and connected devices
- **Voice Features** - Whisper STT + ElevenLabs TTS
- **Multi-User System** - JWT authentication with role-based access
- **Admin Dashboard** - User management and system configuration
- **LAN Connectivity** - Configurable backend URL for local/remote servers

🎨 **UI/UX**
- Modern gradient theme (Purple/Orange)
- Smooth animations and transitions
- Dark mode optimized
- Responsive design
- Tailwind CSS styling

⚙️ **Technology Stack**
- **Frontend**: React 18 + TypeScript + Vite
- **Desktop**: Electron 27
- **Styling**: Tailwind CSS + PostCSS
- **HTTP Client**: Axios
- **Animations**: Framer Motion
- **State Management**: Zustand/Jotai
- **Build**: Electron Builder

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Edit .env with your API URL
VITE_API_URL=http://localhost:3000
```

### Development

```bash
# Start dev server + Electron
npm run dev

# Type checking
npm run type-check
```

### Build

```bash
# Build for production
npm run build

# Create distributable (Windows)
npm run dist
```

## Project Structure

```
Astrix-AI-v2/
├── src/
│   ├── main/
│   │   ├── main.ts          # Electron main process
│   │   └── preload.ts       # IPC bridge & context isolation
│   ├── renderer/
│   │   ├── main.tsx         # React entry point
│   │   └── App.tsx
│   ├── components/
│   │   ├── Layout.tsx       # Main layout & nav
│   │   ├── Login.tsx        # Authentication
│   │   ├── Dashboard.tsx    # Home page
│   │   ├── Chat.tsx         # AI chat interface
│   │   ├── SmartHome.tsx    # Device control
│   │   └── Admin.tsx        # User management
│   ├── hooks/
│   │   ├── useAuth.ts       # Auth state management
│   │   ├── useSmartHome.ts  # Smart home control
│   │   └── useVoice.ts      # Voice features
│   ├── api/
│   │   └── client.ts        # Axios API client
│   ├── types/
│   │   └── index.ts         # TypeScript definitions
│   └── styles/
│       └── globals.css      # Global styles
├── public/                  # Static assets
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies & scripts
```

## API Requirements

The app expects a backend API at the configured `VITE_API_URL` with these endpoints:

### Authentication
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `POST /auth/register` - User registration
- `GET /auth/verify` - Token verification

### Users (Admin)
- `GET /users` - List all users
- `GET /users/:id` - Get user details
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Delete user

### Smart Home
- `GET /smart-home/devices` - List devices
- `POST /smart-home/devices/:id/control` - Control device
- `GET /smart-home/hue/lights` - List Hue lights
- `PUT /smart-home/hue/lights/:id` - Control light
- `GET /smart-home/hue/scenes` - List scenes
- `POST /smart-home/hue/scenes/:id/activate` - Activate scene

### Chat
- `POST /chat/:sessionId/messages` - Send message
- `GET /chat/:sessionId/messages` - Get history
- `POST /chat/sessions` - Create session
- `GET /chat/sessions` - List sessions

### Voice
- `POST /voice/transcribe` - Transcribe audio (Whisper)
- `POST /voice/synthesize` - Synthesize voice (ElevenLabs)

## Configuration

### Environment Variables

```env
# API Configuration
VITE_API_URL=http://localhost:3000

# App Info
VITE_APP_NAME=Astrix AI
VITE_APP_VERSION=2.0.0

# Development
NODE_ENV=development
```

### Electron Configuration

Main process config is stored in `userData/config.json`:
- Backend URL
- User preferences
- Smart home integrations
- Voice settings

## Features in Detail

### Multi-User Authentication
- Login with username/password
- JWT token storage in localStorage
- Admin role for user management
- Automatic redirect on auth failure

### Smart Home Integration
- **Philips Hue**: Full light control with brightness/color
- **Generic Devices**: Extensible device control
- Scenes and presets
- Real-time status updates

### AI Chat Interface
- Message history per session
- Text input with send
- Voice recording and transcription
- Voice synthesis for responses
- Session management

### Voice Features
- **Whisper STT**: Audio to text transcription
- **ElevenLabs TTS**: Text to speech synthesis
- Microphone access with permission handling
- Audio playback for responses

### Admin Dashboard
- User CRUD operations
- Role management (Admin/User)
- Account creation and deletion
- User statistics

## Security

- ✅ Context isolation in preload
- ✅ No node integration in renderer
- ✅ JWT token-based authentication
- ✅ HTTPS support for API calls
- ✅ Secure credential storage in config
- ✅ Input validation & sanitization

## Performance

- Code splitting with Vite
- Lazy loading of routes
- Optimized re-renders with React hooks
- Efficient API client with interceptors
- Smooth animations with GPU acceleration

## Troubleshooting

### Dev server not connecting
```bash
# Kill any existing processes
lsof -i :5173
# Restart dev server
npm run dev
```

### Electron won't start
```bash
# Clear build cache
rm -rf dist/
# Rebuild
npm run build:main
npm run dev
```

### API connection issues
1. Check `VITE_API_URL` in `.env`
2. Verify backend is running
3. Check network connectivity
4. Review browser console (Dev Tools)

## Building for Production

```bash
# Build everything
npm run build

# Create Windows installer
npm run dist

# Output in ./release/
```

## Development Tips

- Use `npm run type-check` before committing
- Check console for React/Electron errors
- Use electron DevTools (Ctrl+Shift+I in dev mode)
- Test auth flow frequently
- Validate API responses match types

## Future Enhancements

- [ ] Multi-account support
- [ ] Local encryption for sensitive data
- [ ] Camera streaming integration
- [ ] Notification system
- [ ] Plugin system
- [ ] Offline mode
- [ ] Advanced analytics
- [ ] Dark/light theme toggle

## License

MIT - Built by Astrix AI Team

## Support

For issues, check:
1. Console logs (Dev Tools)
2. Backend API health
3. Network connectivity
4. Environment configuration
5. GitHub issues

---

**Astrix AI v2.0** - Your intelligent desktop assistant ✨
