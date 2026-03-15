# 👁️ Argus - Critical Thinking Assistant

A production-grade, full-stack web application that analyzes text for logical fallacies, cognitive biases, heuristics, and manipulation tactics. Built with TypeScript, React, Node.js, and AI.

![CI](https://github.com/yourusername/argus/workflows/CI/badge.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)
![React](https://img.shields.io/badge/React-18-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

### Core Features
- **AI-Powered Analysis** - Detects logical fallacies, cognitive biases, heuristics, and manipulation tactics
- **Logic Score** - Rates text from 0-100 based on reasoning quality
- **Dark/Light Theme** - System-aware theme with manual toggle
- **PWA Support** - Installable on mobile, works offline
- **Share & Export** - Generate share links, export to PDF/JSON

### User Features
- **User Accounts** - Register, login, save analysis history
- **Analysis History** - View and manage past analyses
- **Analytics Dashboard** - Track usage statistics and trends
- **Preferences** - Customize theme and notifications

### Technical Features
- **TypeScript** - Full type safety across frontend and backend
- **E2E Testing** - Comprehensive Playwright test suite
- **Docker Ready** - One-command deployment
- **CI/CD** - GitHub Actions pipeline

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, React Router |
| **Backend** | Node.js, Express, TypeScript, Prisma |
| **Database** | SQLite (dev) / PostgreSQL (prod) |
| **AI** | Groq API (Llama 3.1 70B) |
| **Auth** | JWT, bcrypt |
| **Testing** | Playwright (E2E), Vitest |
| **PWA** | Vite PWA Plugin, Workbox |
| **DevOps** | Docker, GitHub Actions |

## Project Structure

```
argus/
├── client/                     # React frontend (TypeScript)
│   ├── src/
│   │   ├── components/         # UI and feature components
│   │   │   ├── ui/             # Reusable UI components
│   │   │   └── features/       # Feature-specific components
│   │   ├── context/            # React Context (Auth, Theme, Analysis)
│   │   ├── pages/              # Page components
│   │   ├── services/           # API service layer
│   │   ├── types/              # TypeScript types
│   │   ├── hooks/              # Custom React hooks
│   │   └── styles/             # Global styles
│   ├── e2e/                    # Playwright E2E tests
│   ├── public/                 # Static assets (PWA icons)
│   └── playwright.config.ts
│
├── server/                     # Node.js backend (TypeScript)
│   ├── src/
│   │   ├── config/             # Configuration & database
│   │   ├── controllers/        # Request handlers
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # API routes
│   │   ├── services/           # Business logic
│   │   ├── types/              # TypeScript types
│   │   └── utils/              # Utilities
│   └── prisma/                 # Database schema & migrations
│
├── extension/                  # Browser extension (MV3)
├── .github/                    # CI/CD workflows
└── docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- [Groq API Key](https://console.groq.com/keys) (free)

### Development Setup

```bash
# Clone repository
git clone https://github.com/yourusername/argus.git
cd argus

# Setup server
cd server
npm install
cp .env.example .env
# Edit .env and add GROQ_API_KEY

# Initialize database
npx prisma generate
npx prisma db push

# Start server
npm run dev

# In another terminal - setup client
cd ../client
npm install
npm run dev
```

Visit `http://localhost:5173`

### Docker Setup

```bash
# Set your API key
export GROQ_API_KEY=your_key_here

# Start everything
docker compose up --build
```

## Testing

### E2E Tests (Playwright)

```bash
cd client

# Install browsers
npx playwright install

# Run tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui
```

### Unit Tests

```bash
# Server
cd server && npm test

# Client
cd client && npm test
```

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| PATCH | `/api/auth/preferences` | Update preferences |

### Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Analyze text |
| GET | `/api/analyze/:id` | Get analysis by ID |
| GET | `/api/analyze/share/:shareId` | Get shared analysis |
| GET | `/api/analyze/history` | Get user's history |
| GET | `/api/analyze/:id/export` | Export (PDF/JSON) |
| DELETE | `/api/analyze/:id` | Delete analysis |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analytics/track` | Track event |
| GET | `/api/analytics/dashboard` | Get dashboard data |

## Theme System

Argus supports three theme modes:

- **Dark** - Default dark theme
- **Light** - Light theme
- **System** - Follows OS preference

Themes are persisted in localStorage and synced with user preferences when logged in.

```typescript
const { theme, setTheme, toggleTheme } = useTheme();
```

## PWA Features

- ✅ Installable on mobile and desktop
- ✅ Offline support for cached pages
- ✅ App-like experience
- ✅ Push notification ready

## Authentication Flow

1. **Register** - Create account with email/password
2. **Login** - Receive JWT token
3. **Auth Header** - Include `Authorization: Bearer <token>`
4. **Persistence** - Token stored in localStorage

## Analytics Dashboard

Track and visualize:

- Total analyses and users
- Daily analysis trends
- Score distribution
- Most common issues detected

## Export & Share

### Export Formats
- **PDF** - Formatted report with score, summary, and issues
- **JSON** - Raw data for programmatic use

### Share Links
- Each analysis gets a unique share ID
- Anyone with the link can view the analysis
- No authentication required for viewing

## Deployment

### Environment Variables

```env
# Server
PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
GROQ_API_KEY=your-groq-key
CLIENT_URL=https://your-domain.com

# Client
VITE_API_URL=https://api.your-domain.com
```

### Deployment Options

| Platform | Files |
|----------|-------|
| Vercel | `client/vercel.json` |
| Fly.io | `*/fly.toml` |
| Render | `render.yaml` |
| Docker | `docker-compose.yml` |

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Write tests for new features
4. Commit changes (`git commit -m 'feat: add amazing feature'`)
5. Push branch (`git push origin feature/amazing`)
6. Open Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License

---

<p align="center">
  <br/>
  <sub>TypeScript • React • Node.js • AI-Powered</sub>
</p>
