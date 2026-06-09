# 💻 Astrix AI v2 - Installation Guide

Welcome! This guide walks you through installing and running Astrix AI v2 on Windows.

## System Requirements

**Minimum:**
- Windows 7 SP1 or later (Windows 10/11 recommended)
- 4 GB RAM
- 500 MB disk space
- Intel or AMD processor (x64)

**Recommended:**
- Windows 10/11 (21H2+)
- 8 GB RAM
- SSD (faster startup)
- 1 GB disk space

## Installation Methods

### Method 1: Installer (Recommended) 🎯

**Easiest way for most users**

1. **Download** `Astrix AI Setup 2.0.0.exe`
2. **Run** the installer
3. **Click** "Install" when prompted by Windows SmartScreen
4. **Wait** for installation to complete
5. **Launch** from Start Menu or Desktop shortcut

**Advantages:**
- ✅ Automatic updates
- ✅ Start Menu integration
- ✅ Desktop shortcut
- ✅ Uninstall via Control Panel

**Troubleshooting:**
- If Windows blocks it: Click "More info" → "Run anyway"
- If it hangs: Run as Administrator (right-click → Run as administrator)
- If it fails: Delete `%APPDATA%\Astrix AI` and try again

---

### Method 2: Portable ZIP 📦

**No installation needed - just extract and run**

1. **Download** `Astrix AI-2.0.0-win.zip`
2. **Extract** to desired location (e.g., Desktop or Documents)
3. **Open** the extracted folder
4. **Double-click** `Astrix AI.exe`
5. **Done!** The app launches immediately

**Advantages:**
- ✅ No admin rights required
- ✅ No installation wizard
- ✅ Can move the folder anywhere
- ✅ Portable on USB drive

**Disadvantages:**
- ❌ No automatic updates
- ❌ No Start Menu shortcut
- ❌ No system integration

**Portable on USB:**
- Extract to USB drive
- App works on any Windows PC
- Perfect for traveling or testing

---

## First Launch

### Initial Setup (< 2 minutes)

1. **Start the app** (installer or portable)
2. **See the login screen** with Astrix AI logo
3. **Enter credentials:**
   - Username: `admin`
   - Password: `password`
4. **Click "Sign In"**
5. **See the Dashboard** 🎉

### What to Try First

**1. Dashboard** (Default home screen)
- See your user info
- Quick access to all features
- Status indicators

**2. Group Chat** (💬 sidebar menu)
- Send a test message
- See it appear for other users
- Try emoji quick-select

**3. Smart Home** (🏠 sidebar menu)
- If Hue lights connected: Control brightness
- Otherwise: See demo data
- Toggle switches and scenes

**4. Security** (🔐 sidebar menu)
- Click "Add Camera"
- Enter test camera details:
  - Name: `Test Camera`
  - RTSP URL: `rtsp://192.168.1.100:554/stream1` (or leave blank)
  - Resolution: `1920x1080`
  - FPS: `30`
- Click "Add" to add to your system

**5. Admin Panel** (⚙️ sidebar menu - admin only)
- Add new users
- Change permissions
- View activity logs

---

## Configuration

### Backend Server

The app connects to a backend server over LAN.

**Default:** `http://192.168.1.74:18790`

**To change:**
1. Open the app
2. Go to Settings (⚙️ icon, top right)
3. Update "Backend URL"
4. Click "Save"
5. Restart the app

### Smart Home Setup

**For Philips Hue:**
1. Go to Smart Home (🏠)
2. Ensure your Hue Bridge IP is correct
3. Click "Discover Lights"
4. Control brightness and colors

**For Security Cameras:**
1. Go to Security (🔐)
2. Click "Add Camera"
3. Enter RTSP URL from your DVR/camera
4. ZOSI DVR example:
   ```
   rtsp://192.168.1.100:554/stream1
   ```
5. Click "Add"

### Multi-User Setup

If you're the admin:

1. Go to Admin Panel (⚙️)
2. Click "Add New User"
3. Enter username and password
4. Select role (User or Admin)
5. Click "Create"
6. Share login credentials with family members

Other users:
1. Restart the app
2. Login with their credentials
3. See their own dashboard and chat

---

## Uninstalling

### Via Installer

1. **Open** Settings → Apps → Apps & Features
2. **Find** "Astrix AI" in the list
3. **Click** "Astrix AI"
4. **Click** "Uninstall"
5. **Follow** the uninstaller wizard
6. **Done!** App is removed

### Portable (ZIP)

1. **Delete** the extracted folder
2. **That's it!** No cleanup needed

### Remove Data

Data is stored in: `%APPDATA%\Astrix AI\`

To delete all settings and login data:
1. Press `Win + R`
2. Type `%APPDATA%`
3. Open `Astrix AI` folder
4. Delete the entire folder
5. Reinstall if needed

---

## Troubleshooting

### App Won't Start

**Check 1:** Is the backend server running?
- Ping the server: `ping 192.168.1.74`
- If no response: Start the backend server first

**Check 2:** Is port 18790 open?
- Run: `netstat -an | find ":18790"`
- If nothing: Server isn't running

**Check 3:** Windows Defender blocking?
- Allow the app through firewall:
  1. Settings → Firewall → Allow apps
  2. Find "Astrix AI"
  3. Check "Private" and "Public"

**Check 4:** Corrupt installation?
- Uninstall completely (delete `%APPDATA%\Astrix AI`)
- Reinstall fresh
- Don't restore old data

### Login Fails

**"Invalid credentials"**
- Check username/password spelling
- Default: `admin` / `password`
- Check caps lock
- Ask admin to reset password

**"Server unreachable"**
- Check backend server is running
- Check IP address is correct
- Check network connection
- Check firewall isn't blocking

### Camera Not Showing

**No cameras listed**
- RTSP URL might be wrong
- Camera might be offline
- Check URL format: `rtsp://192.168.x.x:554/stream1`
- Test URL in VLC to confirm it works

### Chat Messages Not Syncing

**Messages appear but don't show for others**
- Check network connection
- Ensure everyone is logged in
- Refresh the page (F5)
- Check backend server logs

### Updates Not Working

**Auto-updates won't install**
- App might need restart
- Check internet connection
- Try manual reinstall of latest version
- Check Windows has space for update

---

## Performance Tips

### Speed Up the App

1. **Close background apps** - Free up RAM
2. **Use SSD** - Faster than HDD
3. **Update Windows** - Latest drivers help
4. **Reduce camera resolution** - If using many cameras
5. **Limit group chat history** - Fewer old messages = faster

### Network Optimization

1. **Use 5GHz WiFi** - Faster than 2.4GHz
2. **Wired ethernet** - Most stable
3. **Close VPNs** - Can slow things down
4. **Check router** - Restart if slow

---

## Getting Help

**Issue?** Check these first:
1. ✅ Backend server is running
2. ✅ Network is connected
3. ✅ Credentials are correct
4. ✅ Windows Defender isn't blocking
5. ✅ Try restarting the app

**Still stuck?**
- Check GitHub Issues: https://github.com/astrixclaw/Astrix-AI-v2/issues
- Check logs: `%APPDATA%\Astrix AI\logs\`
- Try portable version (not installer)
- Do a complete uninstall + reinstall

---

## What's Included

✨ **Features:**
- Multi-user login with admin dashboard
- Group chat for household messaging
- Smart home control (Philips Hue)
- Security camera management (ZOSI DVR + IP cameras)
- Personal AI chat ready (requires backend)
- Voice support ready (requires ElevenLabs + Whisper)

📚 **Documentation:**
- FEATURES.md - Complete feature guide
- DEVELOPMENT.md - For developers
- BUILD-WINDOWS.md - Building from source
- BRANDING.md - Logo and design system

🚀 **Ready to go!**
- Modern dark UI with gradient theme
- Responsive design
- Fast and lightweight
- Privacy-focused (local LAN)

---

## Next Steps

1. ✅ Install the app
2. ✅ Login with default credentials
3. ✅ Explore the dashboard
4. ✅ Add cameras and test features
5. ✅ Create new users for family members
6. ✅ Enjoy your household assistant! 🏠

---

**Questions?** Check FEATURES.md for detailed guides, or ask in GitHub Issues!

**Have fun!** 🎉
