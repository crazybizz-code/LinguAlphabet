# Torty the Tortoise — Interactive Mascot Guide

This package contains the assets and interaction script for **Torty the Tortoise**, the interactive study companion for the **linguAlphabet** platform.

---

## 📦 DELIVERED FILES

1. **linguAlphabet-mascot.svg** — Core vector illustration asset. Includes headphones, modular accessories, and expressions.
2. **mascot-animations.css** — GPU-accelerated CSS animations for the 6 primary states (Idle, Thinking, Correct, Wrong, Loading, Level Up).
3. **mascot-interaction.js** — The interactive controller class (`MascotInteractionManager`) driving expressions, confetti particle systems, Web Audio API sound synthesis, and popups.
4. **mascot-demo.html** — Live sandbox page demonstrating the states, clicks, winks, and configurations.

---

## 🎯 QUICK START

### 1. Link Styles and Scripts
Include the CSS stylesheet in your `<head>` and the JS controller before your closing `</body>` tag:

```html
<link rel="stylesheet" href="mascot-animations.css">
<script src="mascot-interaction.js"></script>
```

### 2. Add Mascot SVG
Embed the SVG markup inside a container in your page structure:

```html
<div class="mascot-container" id="mascot-container" style="width: 250px; height: 250px;">
  <svg id="torty-mascot" viewBox="0 0 400 400">
    <!-- Torty SVG layers here -->
  </svg>
</div>
```

### 3. Initialize Controller
Instantiate the manager class to bind the interactive states:

```javascript
// Initialize and attach listeners
const mascot = new MascotInteractionManager();

// Configure custom delays/volume
mascot.configure({
  enableSound: true,
  soundVolume: 0.4,
  autoResetDelay: 3000
});
```

---

## 🤖 API METHODS Reference

### User Actions & Triggers

| Method | Parameters | Mascot Reaction |
|--------|------------|-----------------|
| `onQuestionShow()` | None | Shifts to `THINKING` state. Tilts head, wiggles foot, shows thought bubble. |
| `onCorrectAnswer(xp)` | `xp: number` | Shifts to `CORRECT` celebration. Jumps up, spins 360°, emits confetti, pops floating XP, plays chime. |
| `onWrongAnswer()` | None | Shifts to `WRONG` sympathy. Shakes left-right, sad eyebrows, downturned mouth, retry text bubble, plays error tone. |
| `onLoading()` | None | Shifts to `LOADING` processing. Fast head bob, pupil spirals. |
| `onQuizComplete(badgeId, name)` | `id: string`, `name: string` | Shifts to `LEVELUP` fanfare. Trophy lift animation, rainbow color-cycling glow, floats stars & trophy, plays victory tone. |
| `onHintGiven()` | None | Winks right eye, plays sweet chime, displays hint speech bubble. |
| `onStreakUpdate(count)` | `count: number` | Spawns popping fire streak count indicator. |
| `onMascotClick()` | None | Interactive response. Speaks hello, waves, spins, or hops. |

---

## ⚙️ TECHNICAL SPECIFICATIONS

- **Sound Synthesis**: Audio tones are created dynamically using Web Audio oscillators (`sine`, `triangle`, `sawtooth` waves). No network requests or audio file fetches are required.
- **Prefeered Reduced Motion**: Automatically stops all keyframe animations for users who have configured accessibility preferences for reduced motion.
- **GPU Accelerated**: Animations rely on transform scales, translations, and filters to maintain a smooth 60fps on mobile.
