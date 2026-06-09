# Astrix AI v2 - Quick Start Guide

Get up and running in 5 minutes.

## ⚡ Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **npm** 9+ (included with Node)
- **Windows 10+** (or Linux/macOS for development)

## 🚀 Quick Start (5 minutes)

### 1. Install Dependencies

```bash
cd Astrix-AI-v2
npm install
```

**Expected output:**
```
added 250 packages in 45s
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=Astrix AI
VITE_APP_VERSION=2.0.0
```

### 3. Start Development

```bash
npm run dev
```

**What happens:**
- ✅ Vite dev server starts on http://localhost:5173
- ✅ Electron window opens automatically
- ✅ DevTools open in the window
- ✅ Hot reload enabled (edit files → instant updates)

### 4. Login

Demo credentials:
- **Username:** `admin`
- **Password:** `password`

(Set up your backend API to handle real authentication)

## 📁 What's Included

```
35 files:
├── 8 React components (Login, Dashboard, Chat, etc)
├── 3 Custom hooks (useAuth, useSmartHome, useVoice)
├── 1 Axios API client with interceptors
├── 2 Electron processes (main + preload)
├── Full TypeScript definitions
├── Tailwind CSS with gradient theme
├── Complete documentation
└── Build configuration for Windows installer
```

## 🎯 What You Can Do Now

✅ **Chat Interface**
- Send text messages
- Record and transcribe voice (requires Whisper API)
- Synthesize voice responses (requires ElevenLabs API)

✅ **Smart Home**
- Control Hue lights (requires bridge IP + auth)
- Toggle on/off
- Adjust brightness

✅ **Authentication**
- Login/logout
- Protected routes
- JWT token management
- Admin role support

✅ **Admin Dashboard**
- User management (create, delete, edit)
- Role assignment
- User statistics

## 🔧 Common Commands

```bash
# Development
npm run dev           # Start dev server + Electron

# Building
npm run build         # Build for production
npm run dist          # Create Windows installer

# Quality
npm run type-check    # Check TypeScript errors

# Build tools
npm run build:main    # Compile Electron main process
npm run build:renderer # Compile React bundle
npm run build:preload # Compile preload script
```

## 🌐 Backend API Requirements

The app needs a backend API running at `VITE_API_URL`:

### Minimal Setup (Mock API)

If you don't have a backend yet, use mock responses:

```tsx
// In src/api/client.ts, replace real calls with:
async login(username: string, password: string) {
  return {
    success: true,
    data: {
      user: { id: '1', username, email: 'user@example.com', role: 'admin' },
      token: 'mock-jwt-token'
    }
  }
}
```

### Full API Endpoints Needed

See [README.md](./README.md#api-requirements) for complete API spec.

## 📱 Features Overview

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-user login | ✅ Ready | JWT auth with localStorage |
| Protected routes | ✅ Ready | Auto-redirect to /login |
| Admin panel | ✅ Ready | User CRUD operations |
| Chat interface | ✅ Ready | Text input + send |
| Voice transcription | ⏳ API only | Requires Whisper backend |
| Voice synthesis | ⏳ API only | Requires ElevenLabs API |
| Smart home | ✅ Ready | Hue lights + generic devices |
| Notifications | ✅ Ready | Toast messages (react-hot-toast) |
| Animations | ✅ Ready | Framer Motion + CSS |
| Responsive UI | ✅ Ready | Mobile-friendly design |

## 🎨 UI Preview

- **Modern gradient theme**: Purple (primary) + Orange (secondary)
- **Dark mode optimized**: Easy on the eyes
- **Smooth animations**: Framer Motion transitions
- **Mobile responsive**: Works on all screen sizes
- **Tailwind CSS**: ~70KB minified

## 🛠️ Development Tips

### Hot Reload in Action
```bash
# 1. npm run dev is running
# 2. Edit src/components/Dashboard.tsx
# 3. Save file
# 4. Changes appear instantly in Electron window ✨
```

### Type Checking
```bash
# Before committing, ensure no TypeScript errors
npm run type-check
```

### Browser DevTools
```bash
# In Electron window:
Ctrl+Shift+I (Windows/Linux)
Cmd+Option+I (macOS)
```

### Inspect Element
```
Right-click → Inspect
```

## 🚨 Common Issues

### "Cannot find module '@components'"
- Ensure `tsconfig.json` has path aliases configured ✓
- Run `npm install` again
- Restart dev server

### "ECONNREFUSED - Cannot connect to API"
- Backend not running or wrong URL in `.env`
- Check `VITE_API_URL` matches your backend
- Verify backend is listening on that port

### "Module parse error"
- Clear cache: `rm -rf dist node_modules/.vite`
- Restart dev server: `npm run dev`

### "Build fails on Windows"
- Ensure Node.js is in PATH: `node --version`
- Run in PowerShell as Administrator
- Check Windows 10 build 19041+

## 📚 Documentation

- **[README.md](./README.md)** - Features, architecture, building
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Setup, workflow, debugging
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Tech stack, data flow, security
- **[QUICK_START.md](./QUICK_START.md)** - This file!

## 🚀 Next Steps

1. **Set up your backend API** at `http://localhost:3000`
2. **Implement actual authentication** in the API
3. **Connect to smart home devices** (Hue bridge, etc)
4. **Set up Whisper & ElevenLabs** for voice features
5. **Customize colors** in `tailwind.config.js`
6. **Update logo** at `public/icon.svg`

## 💡 Architecture at a Glance

```
┌─────────────────────────────────┐
│    Electron (Desktop Shell)     │
├─────────────┬───────────────────┤
│   Main Proc │  React App        │
├─────────────┴───────────────────┤
│   Axios API Client              │
├─────────────────────────────────┤
│   Backend API (http://...)      │
└─────────────────────────────────┘
```

## 🎓 Learning Resources

- Electron: https://www.electronjs.org/docs
- React: https://react.dev
- TypeScript: https://www.typescriptlang.org/docs
- Tailwind: https://tailwindcss.com/docs
- Vite: https://vitejs.dev/guide

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes + test
3. Type check: `npm run type-check`
4. Commit: `git commit -m "Add my feature"`
5. Push: `git push origin feature/my-feature`

## 📝 Project Files

```
35 files created:
- 8 React component files
- 3 Custom hook files
- 1 Axios API client
- 2 Electron process files
- 7 Type/util files
- 3 Config files (Tailwind, PostCSS, Vite)
- 3 TypeScript config files
- 2 Documentation files
```

## 🎯 Success Checklist

- [ ] Node.js 18+ installed
- [ ] `npm install` completed
- [ ] `.env` configured
- [ ] `npm run dev` starts without errors
- [ ] Electron window opens
- [ ] Can login with demo credentials
- [ ] Dashboard displays correctly
- [ ] Navigation works
- [ ] DevTools opens with Ctrl+Shift+I

## 🆘 Need Help?

1. **Check console**: Ctrl+Shift+I → Console tab
2. **Review error**: Read the error message carefully
3. **Check docs**: See DEVELOPMENT.md for common issues
4. **Check logs**: Look for `[API]`, `[IPC]`, or `[ERROR]` messages
5. **Restart**: Kill terminal + `npm run dev` again

## 📞 Support

For issues or questions:
1. Check existing GitHub issues
2. Review the documentation
3. Check the development guide
4. Create a new issue with error details

---

**You're all set!** 🎉

Run `npm run dev` and start building amazing things with Astrix AI v2.

**Happy coding!** ✨
