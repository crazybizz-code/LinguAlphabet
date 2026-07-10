# LinguABC

> **AI-powered English Coaching Platform** that helps learners achieve their English goals through personalized learning journeys, real-world podcast lessons, and an intelligent AI Coach.

---

## 📖 Overview

LinguABC is a next-generation English learning platform designed to replace passive language learning with personalized AI coaching.

Instead of simply teaching English, LinguABC guides every learner through an adaptive learning journey based on their goals, current level, strengths, and weaknesses.

Our mission is to make English learning feel natural, motivating, and deeply personalized.

---

## 🎯 Vision

We are not building another English learning app.

We are building the world's most natural AI English Coach.

---

## 🚀 Core Features

- 🤖 AI Coach (Tuto)
- 🎧 Podcast-Based Learning
- 📖 Interactive Transcript
- 📚 Vocabulary Learning
- ✍️ Grammar Practice
- ❓ AI-powered Quizzes
- 🧠 Personalized Learning Brain
- 📈 Progress Tracking
- 🔥 Daily Learning Journey
- 📱 Progressive Web App (PWA)

---

## 🏗 Tech Stack

### Frontend

- Next.js 16 (App Router, Turbopack)
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion

### Backend

- Supabase (Postgres, Auth, `@supabase/ssr`)

### AI

- Google Gemini
- Claude

### Mobile

- Not in scope for this phase. The architecture stays compatible with a
  future Capacitor wrapper, but no Android-specific work is being done yet
  (see `android/`, preserved but currently dormant).

### Deployment

- Vercel

---

## 📂 Project Structure

```
LinguAlphabet/

├── android/                       preserved, not currently wired in
├── content/legacy-podcast-lessons/ preserved podcast content from V1
├── docs/
├── public/
├── scripts/
├── src/
│   ├── app/                       Next.js App Router routes
│   ├── components/                ui/, layout/, mascot/
│   ├── hooks/
│   ├── lib/                       supabase/, motion/, utils.ts
│   └── types/
├── supabase/

├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

This is a rebuilt (V2) codebase. The previous Vanilla JS + Vite application
has been fully retired — see `docs/coding-standards.md` for the current
conventions and `CLAUDE.md` for the up-to-date project overview.

---

## 🤖 AI Development Workflow

```
Founder
        │
        ▼
ChatGPT
(Product Director)

        │
        ▼
Antigravity
(Product Architect)

        │
        ▼
Claude
(Lead Software Engineer)

        │
        ▼
Founder QA

        │
        ▼
Release
```

---

## 📅 Current Development Phase

Current Status

- ✅ Repository Setup
- ✅ Product Planning
- 🚧 Landing Page Polish
- 🚧 Product Documentation
- ⏳ Authentication
- ⏳ Welcome Experience
- ⏳ Dashboard
- ⏳ Podcast Learning
- ⏳ Closed Beta

---

## 🛣 Roadmap

### Phase 1

- Landing Page
- Authentication
- Welcome Experience

### Phase 2

- Assessment
- Personalized Roadmap
- Dashboard

### Phase 3

- Podcast Learning
- Vocabulary
- Grammar
- Quiz

### Phase 4

- Reflection
- Profile
- Settings
- PWA Optimization

### Phase 5

- Closed Beta
- User Feedback
- Public Release

---

## 🚀 Getting Started

Install dependencies

```bash
npm install
```

Run development server

```bash
npm run dev
```

Build production

```bash
npm run build
```

---

## 📄 License

This project is currently private.

All rights reserved.

© LinguABC
