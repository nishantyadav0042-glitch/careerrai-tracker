# Mobile Testing & Performance Guide

## Phase 3: Mobile Optimization & Verification

This guide ensures the Daily Tracker is production-ready on mobile devices. Test on real phones, not browser DevTools.

---

## Device Setup

### Required Test Devices
- **Primary**: iPhone 12 or equivalent (iOS 15+)
- **Secondary**: Pixel 6 or equivalent (Android 12+)
- **Fallback**: Browser DevTools (Chrome DevTools → Device Mode)

### Network Conditions
- WiFi (baseline)
- 4G (typical user)
- 3G (rural/poor signal) — simulate in DevTools
- Offline mode (airplane mode)

---

## Performance Checklist

### Page Load (First Paint)
- [ ] HeroCard visible within 1.5s on 4G
- [ ] Modal opens smoothly without jank
- [ ] Streak number animate (no frame drops)
- [ ] No layout shift (CLS < 0.1)

**Test on actual 4G**:
```bash
# Chrome DevTools → Network → Throttling
# Select "Fast 4G" or custom (4 Mbps down, 1 Mbps up)
```

### Animations
- [ ] Confetti runs at 60fps (smooth, no stuttering)
- [ ] Streak count-up is fluid (600ms duration)
- [ ] Modal slide-up has no jank
- [ ] Transitions between states smooth

**Visual Inspection**: Watch for dropped frames. If jerky, profile with DevTools Profiler.

### Touch Responsiveness
- [ ] Button tap feedback instant (<100ms)
- [ ] Form input focus visible
- [ ] Tap targets ≥44px × 44px (accessibility standard)
- [ ] No 300ms touch delay

**Test**: Tap each button, input field, and toggle. Should feel snappy.

### Memory
- [ ] Open modal 5 times, close. Memory usage returns to baseline.
- [ ] Log 10 times rapid-fire. No memory leak.
- [ ] Scroll todo list up/down 50 times. Smooth, no lag.

**Profile Memory**:
```bash
# Chrome DevTools → Memory
# Take snapshot before, after rapid testing
# Compare heap size (should be similar)
```

---

## Functional Testing

### Logging Flow (Golden Path)
1. **Start**: Student at `/student/tracker`
   - [ ] HeroCard loads with current streak
   - [ ] "Log Today" button visible if not logged
   
2. **Open Modal**: Tap "Log Today"
   - [ ] Modal slides up smoothly
   - [ ] Focus moves to hours selector
   - [ ] Keyboard doesn't cover critical UI
   
3. **Select Hours**: Tap "2h"
   - [ ] Button highlights orange
   - [ ] Submit button remains disabled
   
4. **Select Topics**: Tap "LRDI"
   - [ ] Chip highlights teal
   - [ ] Can select up to 3
   - [ ] 4th tap is disabled (visual feedback)
   
5. **Select Mood**: Tap "💪"
   - [ ] Emoji scales up 200ms
   - [ ] Submit button now enabled (color change)
   
6. **Submit**: Tap submit button
   - [ ] Spinner appears on button
   - [ ] Modal doesn't close yet
   - [ ] After 1-2s: confetti plays
   - [ ] Streak count animates (600ms)
   - [ ] Success modal appears
   - [ ] Auto-dismisses after 3s
   
7. **End**: Back on tracker
   - [ ] HeroCard shows "Logged today ✓"
   - [ ] Streak updated (verify UI reflects latest value)

### Edge Cases
- [ ] **Tap submit twice quickly**: Only one request sent
- [ ] **Lose internet during submit**: Shows error toast, can retry
- [ ] **Re-log same day**: Overwrites previous log (no duplicate)
- [ ] **Back button while modal open**: Closes modal smoothly

### Puzzle Feature
- [ ] Daily puzzle card loads below hero
- [ ] Difficulty badge correct color (Easy=green, Medium=amber, Hard=red)
- [ ] "Solve Now" button navigable
- [ ] Solved state shows time + accuracy

### TODO List
- [ ] Type new todo, hit Enter → added to list
- [ ] Tap checkbox → strikethrough, moves to completed section
- [ ] Tap trash → item deleted, list updates
- [ ] Completed section collapsed by default
- [ ] Progress bar updates on check/uncheck

---

## Responsiveness Matrix

### Screen Sizes
| Device | Width | Test Case |
|--------|-------|-----------|
| iPhone SE | 375px | Modal fits, buttons accessible |
| iPhone 12 | 390px | Baseline design |
| iPhone 14 Pro | 393px | Notch doesn't cover content |
| iPad Mini | 768px | Layout scales to 2-column where applicable |
| Android (small) | 360px | Minimal padding, still usable |
| Android (large) | 540px | Still single-column (not 2-col yet) |

### Viewport Testing
**Chrome DevTools**:
```bash
Device Mode → Responsive
Toggle each size above
Test all interactions at each size
```

### Safe Areas (Notch/Rounded Corners)
- **iPhone 14 Pro**: Notch at top, dynamic island
  - [ ] "Daily Tracker" heading not covered
  - [ ] No content hidden behind notch
  - [ ] Bottom buttons not hidden by home indicator

- **OnePlus (rounded corner)**: 
  - [ ] HeroCard doesn't get cut off at edges
  - [ ] Buttons fully tappable

**CSS Check**:
```css
/* In globals.css — verify */
@supports (padding: max(0px)) {
  body {
    padding-top: max(1rem, env(safe-area-inset-top));
  }
}
```

---

## Offline Testing

### Setup (Airplane Mode)
1. Enable airplane mode on phone
2. Navigate to `/student/tracker`
3. Should still load cached version (if cached)

### Logging Offline
1. Tap "Log Today" with no internet
2. Select options, submit
3. Should show optimistic UI (form closes, streak updates locally)
4. Turn off airplane mode
5. Should auto-sync logs in background
6. Verify logged event appears in Supabase

### IndexedDB Verification
**Chrome DevTools** (if testing in browser):
```bash
DevTools → Application → IndexedDB → careerrai-offline
# Inspect: pending_logs object store
# Should show logs stored locally
```

---

## Accessibility Checklist

### Keyboard Navigation
- [ ] Tab order logical (hours → topics → mood → submit)
- [ ] Visible focus ring on all interactive elements
- [ ] Can submit form with keyboard Enter key
- [ ] Modal backdrop click closes modal

### Screen Reader (iOS VoiceOver)
```bash
Settings → Accessibility → VoiceOver
Swipe right/left to navigate
Double-tap to select
```
- [ ] "Log Today" button labeled & announced
- [ ] Form labels associated (not just icons)
- [ ] "Logged today ✓" state announced
- [ ] Emoji moods described (e.g., "tired emoji", not just "🙏")

### Color Contrast
- [ ] Text on buttons ≥4.5:1 ratio (WCAG AA)
- [ ] Status colors not sole differentiator (+ icons/text)

**Check with**: WebAIM contrast checker or ColorOracle

---

## Network Throttling Scenarios

### Slow 4G (Typical)
- **Downlink**: 4 Mbps
- **Uplink**: 1 Mbps  
- **Latency**: 40ms
- **Test**: Page loads in <3s, modal responsive

### 3G (Poor Network)
- **Downlink**: 1 Mbps
- **Uplink**: 0.5 Mbps
- **Latency**: 100ms
- **Test**: Shows loading spinner, completes in <8s

### Offline
- **No connection**
- **Test**: Local-first via IndexedDB, syncs on reconnect

**Chrome DevTools**:
```bash
DevTools → Network → Throttling → Custom
Set values above
Disable cache for realistic test
```

---

## Battery & Thermal Testing

### Battery Drain
1. Open tracker, leave for 5 minutes
2. Check battery % didn't drop significantly
3. Animations should be paused when tab not focused

### Thermal
1. Run 10 confetti animations rapid-fire
2. Phone shouldn't get hot
3. Back won't be hot to touch

**iOS**: Settings → Battery → Battery Health & Charging
**Android**: Phone → About → Temperature (check settings)

---

## Bug Report Template

When you find an issue:

```
## Issue: [Short title]

**Device**: [iPhone 12, Pixel 6, etc.]
**OS**: [iOS 16.1, Android 13, etc.]
**Network**: [WiFi, 4G, Offline]
**Steps to Reproduce**:
1. ...
2. ...

**Expected**: [What should happen]
**Actual**: [What happened]

**Screenshot**: [Attach if visual]
**Error Log**: [From DevTools Console if applicable]
```

---

## Performance Benchmarks (Target)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| FCP | <2s | TBD | 🔵 |
| LCP | <3s | TBD | 🔵 |
| CLS | <0.1 | TBD | 🔵 |
| Time to Interactive | <4s | TBD | 🔵 |
| Modal open time | <300ms | TBD | 🔵 |
| Submit response | <200ms | TBD | 🔵 |
| Confetti FPS | 60fps | TBD | 🔵 |

*Legend: 🟢 Pass | 🟡 Warning | 🔴 Fail | 🔵 Not tested*

**Measure with**: Lighthouse (DevTools → Lighthouse)

---

## Deployment Checklist

Before shipping to production:

- [ ] All functional tests pass on iPhone + Android
- [ ] No console errors (DevTools → Console)
- [ ] Offline mode tested (airplane mode)
- [ ] Performance benchmarks met (Lighthouse score ≥90)
- [ ] Accessibility audit passed (axe DevTools)
- [ ] Push notifications working (test on real device)
- [ ] 11 PM reminder tested (can't mock time easily; manual check)
- [ ] Confetti smooth at 60fps
- [ ] No memory leaks (DevTools → Memory)
- [ ] Safe areas correct (iPhone notch, Android rounded corners)
- [ ] All buttons ≥44px touch target
- [ ] Dark mode works (iOS: Settings → Display → Dark Mode)

---

## Continuous Monitoring (Post-Launch)

### Sentry Error Tracking
```typescript
// Errors auto-reported from production
// Monitor: Modal crashes, API timeouts, localStorage errors
```

### Firebase Analytics Events
```typescript
// Track in usePushNotifications, useLogging
analytics.logEvent('log_submitted', { hours, topics });
analytics.logEvent('notification_subscribed');
```

### Crash Reporting
- [ ] Set up Firebase Crashlytics
- [ ] Weekly review of crash trends
- [ ] Alert on regression

---

## Debugging Commands

### Chrome DevTools
```javascript
// In console, test offline sync
// Check pending logs
const db = await indexedDB.open('careerrai-offline', 1);
console.log(db.objectStoreNames); // verify stores exist

// Check service worker
navigator.serviceWorker.getRegistrations().then(regs => 
  console.log('Service workers:', regs)
);

// Test Supabase connection
const { data, error } = await supabase.auth.getUser();
console.log('Auth:', data?.user?.email, error);
```

### iOS Safari
1. Connect Mac to iPhone
2. Safari → Develop → [Device] → [Your App]
3. Opens DevTools (similar to Chrome)

---

## Resources

- [Web Vitals](https://web.dev/vitals/)
- [WCAG Accessibility](https://www.w3.org/WAI/WCAG21/quickref/)
- [iOS Safe Areas](https://developer.apple.com/design/human-interface-guidelines/ios/visual-design/adaptivity-and-layout/)
- [Android Best Practices](https://developer.android.com/guide/practices)
