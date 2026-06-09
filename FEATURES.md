# 🎯 Astrix AI v2 - Features Documentation

## 🏠 Dashboard
- **Home overview** of all household systems
- **Quick stats** - Devices status, messages, activities
- **Recent activity** - Log of household events
- **Shortcuts** to frequently used features

---

## 💬 Chat Modes

### 1. **Personal Chat** (`/chat`)
Private conversation with the Astrix AI assistant.

**Features:**
- Text-based messaging with AI
- Voice input (press mic button to record)
- Voice output (click speaker to hear responses)
- Message history within session
- Auto-scroll to latest message
- Loading states and error handling

**Use Cases:**
- Ask questions
- Control smart home via voice
- Get information
- Set reminders

---

### 2. **Group Chat** (`/group-chat`)
Household messaging system for all family members.

**Features:**
✅ **Easy to Use:**
- Send text messages to the whole household
- Quick emoji reactions (👋 😊 👍 ❤️ 🎉 😂)
- Message timestamps (relative: "2 minutes ago")
- User avatars with auto-generated initials

✅ **User Awareness:**
- See who sent each message
- Admin badges for household admins
- User color-coded avatars for quick recognition
- Display sender's display name

✅ **Advanced:**
- @mention system (type @username to mention someone)
- Image attachment ready (placeholder included)
- Message formatting support
- Real-time delivery

**Use Cases:**
- Family announcements ("We're having dinner at 7pm")
- Coordinate household tasks ("Can someone take out trash?")
- Share updates ("I'm heading to the store")
- General conversation and planning

---

## 🏠 Smart Home Control

### 1. **Smart Home Lights** (`/smart-home`)
Control all Philips Hue lights in your home.

**Features:**
- **Discover devices** automatically
- **Toggle lights** on/off with one click
- **Brightness control** with slider (0-100%)
- **Color selection** (for color bulbs)
- **Scene activation** (Dimmed, Bright, Nightlight)
- **Room grouping** (organize by location)
- **Real-time status** of all devices
- **Error handling** with helpful messages

**Supported Devices:**
- Philips Hue White Bulbs
- Philips Hue Color Bulbs
- Philips Hue Light Strips
- Smart switches

**Use Cases:**
- Turn lights on/off by voice or app
- Set mood with scenes
- Adjust brightness for comfort
- Automate with routines

---

### 2. **Home Security** (`/security`)
Manage security cameras including ZOSI DVR and IP cameras.

## ✨ **Easy Camera Management**

### **Add a Camera - Simple 4-Step Process:**

1. **Click "Add Camera" button** (blue + icon)
2. **Fill in camera details:**
   - 📷 **Camera Name** - What you call it (Front Door, Backyard, etc.)
   - 📡 **RTSP Stream URL** - The video feed address
   - 📐 **Resolution** - Choose 720p, 1080p, 1440p, or 4K
   - ⏱️ **Frame Rate** - 5-60 FPS (30 is standard)
3. **Click "Add Camera"**
4. **Done!** Camera appears in your list

### **ZOSI DVR Setup Example:**
```
Camera Name: Front Door
Resolution: 1920x1080
FPS: 30
RTSP URL: rtsp://192.168.1.100:554/stream1
```

Replace:
- `192.168.1.100` with your ZOSI DVR IP
- `stream1` with channel (stream1, stream2, stream3, stream4)

### **Generic IP Camera Setup:**
```
RTSP URL: rtsp://camera-ip:554/stream1
```

### **Features:**
✅ **Quick Add:**
- Pre-filled common resolutions
- Helpful placeholder text
- Validation before adding

✅ **Camera Management:**
- View all cameras in grid layout
- See resolution and FPS at a glance
- Online/offline status indicators (🟢 online, 🔴 offline)
- Delete unwanted cameras (hover to reveal delete button)

✅ **Live Preview:**
- Placeholder for live stream display
- Ready for RTSP stream integration
- Configure button for advanced settings

✅ **Camera Details:**
- Camera name
- Resolution
- Frame rate
- RTSP URL
- Connection status

**Supported Formats:**
- RTSP streams
- IP cameras with RTSP output
- ZOSI DVR systems
- Hikvision cameras
- Any camera with RTSP support

**Use Cases:**
- Monitor front door arrivals
- Watch backyard activity
- Security during travel
- Check on kids/pets
- Business monitoring

---

## ⚙️ Admin Dashboard (`/admin`)

Control user access and manage household members.

**Features:**
- **User List** - See all household members
- **Create Users** - Add new family members
- **Delete Users** - Remove access when needed
- **Role Assignment** - Admin or User
- **Statistics** - Users, activity, uptime

**Permission System:**
- **Admin** - Full access to all features
- **User** - Limited to assigned devices/rooms
- **Per-Device Permissions** - Grant specific light rooms or cameras

**Use Cases:**
- Add children or guests
- Grant camera access to specific people
- Remove old users
- View household activity

---

## 🎤 Voice Features (Ready to Integrate)

### Personal Chat Voice:
- **Record:** Click mic button → speak → releases automatically
- **Playback:** Click speaker icon on AI response
- **Models:**
  - Whisper (OpenAI) - Speech to Text
  - ElevenLabs - Text to Speech (Brian, Luna, or custom voices)

### Setup:
```
# Add to .env
OPENAI_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ID=YOUR_VOICE_ID
```

---

## 🔐 Security & Permissions

### Authentication:
- JWT token-based sessions
- Auto-login with saved credentials
- 1-hour token expiration
- Secure logout

### Data Protection:
- Passwords hashed with bcrypt
- Role-based access control
- Per-user data isolation
- Encrypted communication

---

## 📱 Device Support

- **Windows Desktop** (Electron)
- **Responsive Design** - Works on tablets
- **Dark Mode** - Optimized for viewing
- **Touch Friendly** - Buttons sized for touch

---

## 🚀 Getting Started

### 1. **Dashboard**
   - Check device status
   - See household overview

### 2. **Add Lights**
   - Go to Smart Home
   - Lights auto-discover from Hue Bridge
   - Toggle and adjust

### 3. **Add Cameras**
   - Go to Security
   - Click "Add Camera"
   - Enter RTSP URL for each camera
   - (See ZOSI DVR example above)

### 4. **Group Chat**
   - Go to Group Chat
   - Send message to household
   - Use emojis or @mention people

### 5. **Admin Setup**
   - Go to Admin (admin only)
   - Create users for family
   - Assign roles and permissions

---

## 🔧 Configuration

### Backend API Setup:
```env
# .env
BACKEND_URL=http://192.168.1.74:18790
BACKEND_TIMEOUT=10000
```

### ZOSI DVR:
```
IP Address: 192.168.1.100 (typical)
RTSP Port: 554 (standard)
Stream URLs:
  - Channel 1: rtsp://192.168.1.100:554/stream1
  - Channel 2: rtsp://192.168.1.100:554/stream2
  - Channel 3: rtsp://192.168.1.100:554/stream3
  - Channel 4: rtsp://192.168.1.100:554/stream4
```

---

## ❓ FAQ

**Q: Where are cameras stored?**  
A: Camera settings are saved locally in the app and synced to the backend.

**Q: Can I access cameras outside my home?**  
A: Yes, once we set up the VPS proxy (Phase 2).

**Q: How many cameras can I add?**  
A: Unlimited! Limited only by your network bandwidth.

**Q: Can guests see everything?**  
A: No! Admins control what each user can see via permissions.

**Q: Do I need a Hue Bridge?**  
A: Yes, for Philips Hue lights. ZOSI DVR is accessed directly.

---

## 📞 Support

Need help? Check these files:
- `QUICK_START.md` - 5-minute setup
- `DEVELOPMENT.md` - Developer guide
- `ARCHITECTURE.md` - System design
