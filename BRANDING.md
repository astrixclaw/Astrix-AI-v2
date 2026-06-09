# 🎨 Astrix AI v2 - Branding & Logo

## Logo Integration

The Astrix AI logo is now integrated throughout the application for consistent, professional branding.

### Logo Files

Located in `public/`:
- **astrix-logo.svg** - Vector logo (1.3 KB) - Primary logo file
- **astrix-icon.png** - Raster icon (64 KB) - Fallback/export format

### Logo Usage Across the App

#### 1. **Header Navigation** (10x10px)
- **Location:** `src/components/Layout.tsx`
- **Size:** 10x10px
- **Effect:** Hover scale-up (105%)
- **Context:** Left side of main navigation bar
- **Clickable:** Yes, links to dashboard

```tsx
<img 
  src="/astrix-logo.svg" 
  alt="Astrix AI Logo" 
  className="w-10 h-10 group-hover:scale-105 transition-transform drop-shadow-lg"
/>
```

#### 2. **Login Screen** (96x96px)
- **Location:** `src/components/Login.tsx`
- **Size:** 96x96px (w-24 h-24)
- **Effect:** Drop shadow for depth
- **Context:** Center of login form
- **Purpose:** Brand recognition on auth screen

```tsx
<img 
  src="/astrix-logo.svg" 
  alt="Astrix AI Logo" 
  className="w-24 h-24 mx-auto mb-6 drop-shadow-2xl"
/>
```

#### 3. **Dashboard Welcome** (48x48px)
- **Location:** `src/components/Dashboard.tsx`
- **Size:** 48x48px (w-12 h-12)
- **Effect:** Drop shadow
- **Context:** Next to welcome greeting
- **Purpose:** Reinforces brand on homepage

```tsx
<img 
  src="/astrix-logo.svg" 
  alt="Astrix AI Logo" 
  className="w-12 h-12 drop-shadow-lg"
/>
```

#### 4. **Browser Tab Icon** (favicon)
- **Location:** `index.html`
- **File:** astrix-logo.svg
- **Size:** Auto (browser renders)
- **Context:** Browser tab
- **Purpose:** Brand visibility in browser tabs

```html
<link rel="icon" type="image/svg+xml" href="/astrix-logo.svg" />
```

### Design System Integration

#### Colors Used with Logo
- **Primary Gradient:** Purple → Blue
- **Background:** Dark slate (from-slate-900 via-purple-900 to-slate-900)
- **Accent:** Purple-500 (#a855f7)

#### Shadow Effects
- **Drop Shadow:** `drop-shadow-lg` for header/dashboard
- **Drop Shadow 2xl:** `drop-shadow-2xl` for login screen
- **Backdrop Blur:** Used around logo on login

#### Animation
- **Hover Scale:** 105% on header logo
- **Transition:** Smooth 200-300ms transitions
- **No rotation:** Logo maintains fixed orientation

### Logo Specifications

**Dimensions:**
- SVG: Vector format (scalable to any size)
- PNG: 256x256px raster

**Colors:**
- Primarily uses accent colors from the app's gradient theme
- Transparent background for flexible placement
- Readable at all sizes from 10px to 256px

**Usage Guidelines:**
- ✅ Use on gradient backgrounds
- ✅ Use with drop shadow for depth
- ✅ Scale proportionally
- ✅ Use on dark backgrounds
- ❌ Don't stretch or distort
- ❌ Don't change colors
- ❌ Don't rotate
- ❌ Don't use on white backgrounds (insufficient contrast)

### Future Branding Applications

The logo can be extended to:
- 📱 Mobile app icon (iOS/Android)
- 🖼️ Splash screens
- 📄 About dialog
- 📋 Help/support pages
- 🎨 Wallpapers and themes
- 🏷️ App badges and stickers
- 💼 Marketing materials

### Responsive Behavior

The logo scales appropriately across screen sizes:
- **Mobile (< 640px):** 10px header, 64px login
- **Tablet (640-1024px):** 10px header, 96px login
- **Desktop (> 1024px):** 10px header, 96px login

All sizes maintain visual hierarchy and readability.

### Git History

Logo integration was added in commit: `e0088bc`

```
Integrate Astrix AI logo throughout the app

Logo placement:
✅ Header navigation (10x10px)
✅ Login screen (96x96px with drop shadow)
✅ Dashboard welcome (48x48px inline)
✅ Browser tab icon (favicon)
✅ Page title meta
```

---

## Brand Identity

**App Name:** Astrix AI  
**Tagline:** Your intelligent desktop assistant  
**Version:** v2  
**Platform:** Windows, Linux, macOS (Electron)  
**Color Theme:** Dark with purple/blue gradients  
**Typography:** Modern sans-serif system fonts  

The logo represents:
- ✨ **Sparkle/Star** - Intelligence and brilliance
- 🎯 **Cosmic** - Advanced technology
- 💫 **Multi-pointed** - Multi-functionality

---

*Logo integration complete. The app now has consistent, professional branding throughout!* 🎨✨
