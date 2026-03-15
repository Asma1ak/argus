# 📚 Argus - Complete Project Documentation

This document explains **every single thing** about the Argus project, from high-level architecture to individual code decisions.

---

## 📋 Table of Contents

1. [What is Argus?](#1-what-is-argus)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack Explained](#3-technology-stack-explained)
4. [Backend Deep Dive](#4-backend-deep-dive)
5. [Frontend Deep Dive](#5-frontend-deep-dive)
6. [Database Schema](#6-database-schema)
7. [Authentication System](#7-authentication-system)
8. [The Analysis Engine](#8-the-analysis-engine)
9. [State Management](#9-state-management)
10. [API Endpoints](#10-api-endpoints)
11. [PWA Features](#11-pwa-features)
12. [Theme System](#12-theme-system)
13. [Export & Share](#13-export--share)
14. [Analytics System](#14-analytics-system)
15. [Testing Strategy](#15-testing-strategy)
16. [CI/CD Pipeline](#16-cicd-pipeline)
17. [Security Measures](#17-security-measures)
18. [File-by-File Breakdown](#18-file-by-file-breakdown)

---

## 1. What is Argus?

**Argus** is a full-stack web application that uses AI to analyze text for:

| Category | Examples |
|----------|----------|
| **Logical Fallacies** | Ad hominem, straw man, false dichotomy, slippery slope |
| **Cognitive Biases** | Confirmation bias, anchoring, availability heuristic |
| **Heuristics** | Mental shortcuts that may mislead thinking |
| **Manipulation Tactics** | Emotional appeals, fear-mongering, gaslighting |

### Why "Argus"?
In Greek mythology, Argus Panoptes was a giant with 100 eyes who saw everything. This app is your "100 eyes" for spotting logical issues.

### Core User Flow
```
1. User pastes text (article, argument, ad, etc.)
2. Click "Analyze"
3. AI examines the text
4. Returns: Score (0-100) + Summary + List of issues
5. User can export (PDF/JSON) or share via link
```

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   React     │  │   Context   │  │     Service Worker      │ │
│  │  Components │◄─┤   (State)   │  │        (PWA)            │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────────┘ │
│         │                │                                      │
│         └────────┬───────┘                                      │
│                  ▼                                              │
│         ┌─────────────────┐                                     │
│         │   API Service   │                                     │
│         └────────┬────────┘                                     │
└──────────────────┼──────────────────────────────────────────────┘
                   │ HTTP/REST
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                        SERVER (Node.js)                          │
│  ┌─────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Routes  │─►│ Middleware │─►│ Controller │─►│   Service    │  │
│  └─────────┘  └────────────┘  └────────────┘  └──────┬───────┘  │
│                                                       │          │
│                                                       ▼          │
│                                               ┌──────────────┐   │
│                                               │   Groq API   │   │
│                                               │  (Llama 3.1) │   │
│                                               └──────────────┘   │
│                                                       │          │
│                                                       ▼          │
│                                               ┌──────────────┐   │
│                                               │   Prisma     │   │
│                                               │  (Database)  │   │
│                                               └──────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack Explained

### Why Each Technology Was Chosen

| Technology | Purpose | Why This One? |
|------------|---------|---------------|
| **TypeScript** | Type safety | Catches bugs at compile time, better IDE support, self-documenting code |
| **React 18** | UI framework | Component-based, huge ecosystem, hooks for state management |
| **Vite** | Build tool | 10-100x faster than Webpack, native ES modules, instant HMR |
| **Node.js** | Backend runtime | JavaScript everywhere, non-blocking I/O, huge npm ecosystem |
| **Express** | Web framework | Minimal, flexible, middleware pattern, battle-tested |
| **Prisma** | ORM | Type-safe database queries, auto-generated types, migrations |
| **SQLite/PostgreSQL** | Database | SQLite for dev (zero config), PostgreSQL for production (scalable) |
| **Groq API** | AI inference | Fast inference (Llama 3.1), free tier available, JSON mode |
| **JWT** | Authentication | Stateless, scalable, industry standard |
| **Playwright** | E2E testing | Modern, fast, cross-browser, great API |
| **Docker** | Containerization | Consistent environments, easy deployment |
| **GitHub Actions** | CI/CD | Free for public repos, integrated with GitHub |

---

## 4. Backend Deep Dive

### Directory Structure
```
server/
├── src/
│   ├── index.ts          # Entry point - starts Express server
│   ├── config/           # Configuration management
│   │   ├── index.ts      # Environment variables & validation
│   │   └── database.ts   # Prisma client initialization
│   ├── routes/           # API route definitions
│   │   └── index.ts      # All routes combined
│   ├── controllers/      # Request handlers (thin layer)
│   │   ├── authController.ts
│   │   ├── analysisController.ts
│   │   └── analyticsController.ts
│   ├── services/         # Business logic (thick layer)
│   │   ├── authService.ts      # Auth logic
│   │   ├── analysisService.ts  # Analysis logic
│   │   ├── groqService.ts      # AI API wrapper
│   │   ├── exportService.ts    # PDF/JSON generation
│   │   └── analyticsService.ts # Usage tracking
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts             # JWT verification
│   │   ├── validation.ts       # Request validation (Joi)
│   │   └── errorHandler.ts     # Global error handling
│   ├── utils/            # Helper functions
│   │   ├── logger.ts           # Winston logging
│   │   └── apiResponse.ts      # Response formatting
│   └── types/            # TypeScript type definitions
│       └── index.ts
└── prisma/
    └── schema.prisma     # Database schema
```

### Request Lifecycle
```
HTTP Request
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express Middleware Stack                  │
├─────────────────────────────────────────────────────────────┤
│  1. helmet()        - Security headers (XSS, etc.)          │
│  2. cors()          - Cross-origin resource sharing         │
│  3. express.json()  - Parse JSON body                       │
│  4. morgan()        - HTTP request logging                  │
├─────────────────────────────────────────────────────────────┤
│                    Route-Specific Middleware                 │
├─────────────────────────────────────────────────────────────┤
│  5. rateLimit       - Prevent abuse (10 req/min for /analyze)│
│  6. requireAuth/optionalAuth - JWT verification             │
│  7. validate()      - Joi schema validation                 │
│  8. sanitizeText    - Remove dangerous characters           │
├─────────────────────────────────────────────────────────────┤
│  9. Controller      - Extract params, call service          │
│  10. Service        - Business logic, call Groq API         │
│  11. Response       - Format and send JSON                  │
├─────────────────────────────────────────────────────────────┤
│  ERROR? → errorHandler middleware catches and formats       │
└─────────────────────────────────────────────────────────────┘
```

### Controller vs Service Pattern

**Controllers** (thin): Only handle HTTP concerns
```typescript
// Controller - Just orchestrates
async analyze(req: Request, res: Response) {
  const { text } = req.body;
  const userId = req.user?.userId;
  
  const result = await analysisService.analyzeText(text, userId);
  
  sendSuccess(res, result, 201);
}
```

**Services** (thick): All business logic
```typescript
// Service - Does the real work
async analyzeText(text: string, userId?: string) {
  // 1. Call AI
  const result = await groqService.complete(SYSTEM_PROMPT, text);
  
  // 2. Normalize response
  const normalized = this.normalizeResult(result);
  
  // 3. Save to database
  const analysis = await prisma.analysis.create({ data: {...} });
  
  // 4. Update user stats
  if (userId) await prisma.user.update({ ... });
  
  return normalized;
}
```

**Why separate?**
- Controllers are easy to test (mock the service)
- Services can be reused (called from jobs, scripts, etc.)
- Clear separation of concerns

---

## 5. Frontend Deep Dive

### Directory Structure
```
client/
├── src/
│   ├── main.tsx              # Entry point - renders App
│   ├── App.tsx               # Root component with routing
│   ├── vite-env.d.ts         # Vite type declarations
│   ├── context/              # React Context providers
│   │   ├── AuthContext.tsx   # User authentication state
│   │   ├── AnalysisContext.tsx # Analysis state & actions
│   │   ├── ThemeContext.tsx  # Dark/light theme
│   │   └── index.ts          # Barrel export
│   ├── pages/                # Route components
│   │   ├── HomePage.tsx      # Main analysis page
│   │   ├── LoginPage.tsx     # Login form
│   │   ├── RegisterPage.tsx  # Registration form
│   │   ├── HistoryPage.tsx   # Analysis history
│   │   ├── DashboardPage.tsx # Analytics dashboard
│   │   └── SharedPage.tsx    # Shared analysis view
│   ├── components/           # Reusable components
│   │   └── features/         # Feature-specific
│   │       ├── theme/        # ThemeToggle
│   │       └── export/       # ExportShare
│   ├── services/             # API communication
│   │   └── api.ts            # Fetch wrapper
│   ├── types/                # TypeScript types
│   │   └── index.ts
│   └── styles/               # Global CSS
│       └── index.css
├── e2e/                      # Playwright tests
├── public/                   # Static assets
└── index.html                # HTML entry point
```

### Component Hierarchy
```
<BrowserRouter>
  <ThemeProvider>          ← Theme context (dark/light)
    <AuthProvider>         ← Auth context (user, login, logout)
      <AnalysisProvider>   ← Analysis context (text, result, analyze)
        <AppContent>
          <Header />       ← Navigation, theme toggle
          <Routes>
            <Route "/" element={<HomePage />} />
            <Route "/login" element={<LoginPage />} />
            ...
          </Routes>
          <Footer />
        </AppContent>
      </AnalysisProvider>
    </AuthProvider>
  </ThemeProvider>
</BrowserRouter>
```

---

## 6. Database Schema

### Entity Relationship Diagram
```
┌─────────────────────┐       ┌─────────────────────────┐
│        User         │       │      UserPreferences    │
├─────────────────────┤       ├─────────────────────────┤
│ id (PK)             │──┐    │ id (PK)                 │
│ email (unique)      │  │    │ userId (FK, unique)     │──┐
│ passwordHash        │  │    │ theme                   │  │
│ name                │  │    │ emailNotifications      │  │
│ analysisCount       │  │    └─────────────────────────┘  │
│ createdAt           │  │                                 │
│ lastActiveAt        │  └─────────────────────────────────┘
└─────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────┐
│       Analysis          │
├─────────────────────────┤
│ id (PK)                 │
│ userId (FK, nullable)   │
│ text                    │
│ summary                 │
│ score                   │
│ issues (JSON string)    │
│ shareId (unique)        │
│ isPublic                │
│ createdAt               │
└─────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────┐
│    AnalyticsEvent       │
├─────────────────────────┤
│ id (PK)                 │
│ event                   │
│ properties (JSON)       │
│ analysisId (FK)         │
│ userId                  │
│ sessionId               │
│ userAgent               │
│ ipHash                  │
│ createdAt               │
└─────────────────────────┘
```

### Why SQLite for Development?
- Zero configuration (just a file)
- No server to install
- Fast for small datasets
- Same SQL syntax as PostgreSQL (mostly)

### Why PostgreSQL for Production?
- Concurrent connections
- ACID compliance
- Full-text search
- JSON operators
- Scales horizontally

---

## 7. Authentication System

### How JWT Auth Works
```
┌─────────────────────────────────────────────────────────────────┐
│                        REGISTRATION                             │
├─────────────────────────────────────────────────────────────────┤
│  1. User submits email + password                               │
│  2. Server hashes password with bcrypt (12 rounds)              │
│  3. Server creates user in database                             │
│  4. Server generates JWT with { userId, email }                 │
│  5. Server returns { user, token }                              │
│  6. Client stores token in localStorage                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          LOGIN                                   │
├─────────────────────────────────────────────────────────────────┤
│  1. User submits email + password                               │
│  2. Server finds user by email                                  │
│  3. Server compares password hash with bcrypt                   │
│  4. If match → generate JWT, return { user, token }             │
│  5. If no match → return 401 Unauthorized                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATED REQUEST                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Client sends: Authorization: Bearer <token>                 │
│  2. requireAuth middleware extracts token                       │
│  3. jwt.verify() validates signature and expiry                 │
│  4. If valid → attach user to req.user, continue                │
│  5. If invalid → return 401 Unauthorized                        │
└─────────────────────────────────────────────────────────────────┘
```

### JWT Structure
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.    ← Header (algorithm)
eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6ImFAYiJ9. ← Payload (data)
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c ← Signature
```

### Password Security
```typescript
// Hashing (registration)
const hash = await bcrypt.hash(password, 12); // 12 salt rounds

// Verification (login)
const valid = await bcrypt.compare(password, hash);
```
- 12 rounds = ~250ms to hash (slow intentionally)
- Rainbow table attacks: impossible
- Brute force: impractical

---

## 8. The Analysis Engine

### How AI Analysis Works

```typescript
// System prompt tells the AI what to do
const SYSTEM_PROMPT = `You are Argus, a critical thinking assistant. Analyze text for:
1. Logical Fallacies
2. Cognitive Biases  
3. Heuristics
4. Manipulation Tactics

Respond in JSON:
{
  "summary": "Brief assessment",
  "issues": [{ type, name, severity, quote, explanation, suggestion }],
  "score": 0-100
}`;

// User prompt contains the text to analyze
const userPrompt = `Analyze this text: "${userText}"`;

// Groq API call
const response = await groq.chat.completions.create({
  model: 'llama-3.1-70b-versatile',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ],
  response_format: { type: 'json_object' }, // Force JSON output
  temperature: 0.3  // Low = more consistent
});
```

### Score Calculation
The AI assigns a score 0-100 based on:
- **100**: Perfectly logical, no issues
- **80-99**: Minor issues, generally sound
- **50-79**: Moderate issues, use caution
- **20-49**: Significant issues, be skeptical
- **0-19**: Severely flawed reasoning

### Issue Types
| Type | Icon | Description |
|------|------|-------------|
| `fallacy` | ⚠️ | Error in logical reasoning |
| `bias` | 🧠 | Systematic thinking error |
| `heuristic` | ⚡ | Mental shortcut that misleads |
| `manipulation` | 🎭 | Intentional persuasion tactic |

---

## 9. State Management

### Why Context + useReducer (not Redux)?

| Approach | Pros | Cons |
|----------|------|------|
| **Redux** | Time-travel debugging, middleware | Boilerplate, overkill for this size |
| **Context + useReducer** | Built-in, simple, type-safe | No middleware, no devtools |
| **Zustand/Jotai** | Minimal, fast | Another dependency |

For a project this size, Context + useReducer is perfect.

### State Shape

```typescript
// Auth State
interface AuthState {
  user: User | null;        // Current user object
  token: string | null;     // JWT token
  preferences: Prefs | null;// User preferences
  isAuthenticated: boolean; // Quick check
  isLoading: boolean;       // Loading indicator
}

// Analysis State  
interface AnalysisState {
  text: string;             // Input text
  result: Result | null;    // Analysis result
  history: HistoryItem[];   // Past analyses
  loading: boolean;         // Loading indicator
  error: string | null;     // Error message
}

// Theme State
type Theme = 'dark' | 'light' | 'system';
```

### Reducer Pattern
```typescript
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGOUT':
      return { ...initialState, isLoading: false };
    // ... other cases
  }
}
```

**Why reducers?**
- Predictable state transitions
- Easy to test (pure functions)
- Actions describe what happened
- State changes are centralized

---

## 10. API Endpoints

### Complete API Reference

```
Base URL: /api

Authentication
──────────────────────────────────────────────────────────
POST   /auth/register         Create new account
       Body: { email, password, name? }
       Returns: { user, token }
       
POST   /auth/login            Login
       Body: { email, password }
       Returns: { user, token }
       
GET    /auth/me               Get current user (🔒 Auth required)
       Returns: { user, preferences }
       
PATCH  /auth/preferences      Update preferences (🔒 Auth required)
       Body: { theme?, emailNotifications? }
       Returns: { preferences }

Analysis
──────────────────────────────────────────────────────────
POST   /analyze               Analyze text
       Body: { text }
       Returns: { id, score, summary, issues, shareId }
       
GET    /analyze/:id           Get analysis by ID
       Returns: { id, text, score, summary, issues }
       
GET    /analyze/share/:shareId Get shared analysis (public)
       Returns: { id, text, score, summary, issues }
       
GET    /analyze/history       Get user's history (🔒 Auth required)
       Query: ?limit=20&offset=0
       Returns: { analyses, total, hasMore }
       
GET    /analyze/:id/export    Export analysis
       Query: ?format=pdf|json
       Returns: PDF file or JSON
       
DELETE /analyze/:id           Delete analysis (🔒 Auth required)
       Returns: { deleted: true }

Analytics
──────────────────────────────────────────────────────────
POST   /analytics/track       Track event
       Body: { event, properties?, sessionId }
       Returns: { tracked: true }
       
GET    /analytics/dashboard   Get dashboard (🔒 Auth required)
       Query: ?days=30
       Returns: { overview, trends, topIssues, scoreDistribution }

Health
──────────────────────────────────────────────────────────
GET    /health                Basic health check
       Returns: { status: "ok" }
       
GET    /health/detailed       Detailed health check
       Returns: { status, database, groqApi, uptime }
```

---

## 11. PWA Features

### What Makes It a PWA?

```html
<!-- index.html -->
<meta name="theme-color" content="#0f172a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<link rel="manifest" href="/manifest.webmanifest" />
```

### Web App Manifest
```javascript
// vite.config.ts → VitePWA plugin generates:
{
  "name": "Argus - Critical Thinking Assistant",
  "short_name": "Argus",
  "description": "Analyze text for logical fallacies...",
  "theme_color": "#0f172a",
  "background_color": "#0f172a",
  "display": "standalone",        // No browser chrome
  "orientation": "portrait",
  "start_url": "/",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192" },
    { "src": "/icons/icon-512.png", "sizes": "512x512" }
  ]
}
```

### Service Worker (Workbox)
```javascript
// Auto-generated by vite-plugin-pwa
workbox: {
  globPatterns: ['**/*.{js,css,html,ico,png,svg}'], // Cache static assets
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com/,
      handler: 'CacheFirst',  // Fonts rarely change
      options: { cacheName: 'google-fonts-cache' }
    },
    {
      urlPattern: /\/api\/analyze$/,
      handler: 'NetworkOnly',  // Analysis must be fresh
    }
  ]
}
```

### PWA Capabilities
- ✅ **Install prompt** - "Add to Home Screen"
- ✅ **Offline support** - Cached pages work offline
- ✅ **App-like** - No browser URL bar
- ✅ **Fast loading** - Service worker caches assets

---

## 12. Theme System

### How Themes Work

```typescript
// ThemeContext.tsx
type Theme = 'dark' | 'light' | 'system';

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState(
    theme === 'system' ? getSystemTheme() : theme
  );
  
  useEffect(() => {
    // Apply to DOM
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.classList.add(resolvedTheme);
    
    // Update meta theme-color (for mobile browser chrome)
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', resolvedTheme === 'dark' ? '#0f172a' : '#fff');
  }, [resolvedTheme]);
  
  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setResolvedTheme(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);
}
```

### CSS Variables
```css
/* styles/index.css */
:root {
  /* Light theme (default) */
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --accent: #6366f1;
}

[data-theme="dark"] {
  /* Dark theme overrides */
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --accent: #818cf8;
}

/* Usage */
.card {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
```

---

## 13. Export & Share

### PDF Generation
```typescript
// exportService.ts
async exportToPDF(analysis) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  
  // Header
  doc.fontSize(24).fillColor('#6366f1').text('Argus Analysis Report');
  
  // Score
  const scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  doc.fontSize(48).fillColor(scoreColor).text(String(score));
  
  // Issues
  for (const issue of analysis.issues) {
    doc.fontSize(11).text(`${issue.name} (${issue.severity})`);
    doc.text(`"${issue.quote}"`);
    doc.text(`Why: ${issue.explanation}`);
    doc.text(`Fix: ${issue.suggestion}`);
  }
  
  doc.end();
  return Buffer.concat(chunks);
}
```

### Share Links
```typescript
// Every analysis gets a shareId on creation
const analysis = await prisma.analysis.create({
  data: {
    ...analysisData,
    shareId: nanoid(10), // e.g., "X7Yk9Pq2mN"
  }
});

// Anyone can view via: /share/X7Yk9Pq2mN
// No authentication required
```

---

## 14. Analytics System

### What's Tracked
```typescript
// Events
'analysis_created'  - When user analyzes text
'analysis_exported' - When user exports PDF/JSON
'analysis_shared'   - When user copies share link
'page_view'         - Page visits

// Properties captured
{
  event: 'analysis_created',
  properties: { score: 75, issueCount: 3 },
  sessionId: 'uuid',
  userId: 'optional',
  userAgent: 'Mozilla/5.0...',
  ipHash: 'abc123...',  // Hashed for privacy
}
```

### Dashboard Metrics
```typescript
interface Dashboard {
  overview: {
    totalAnalyses: number;
    totalUsers: number;
    avgScore: number;
    avgIssueCount: number;
  };
  trends: {
    date: string;
    analyses: number;
    users: number;
    avgScore: number;
  }[];
  topIssues: {
    name: string;
    type: string;
    count: number;
  }[];
  scoreDistribution: {
    range: string;  // "0-20", "21-40", etc.
    count: number;
  }[];
}
```

---

## 15. Testing Strategy

### E2E Tests (Playwright)

```typescript
// e2e/app.spec.ts
test('should analyze text and show results', async ({ page }) => {
  await page.goto('/');
  
  // Fill textarea
  await page.locator('textarea').fill('Everyone is doing it!');
  
  // Click analyze
  await page.click('button:has-text("Analyze")');
  
  // Wait for results
  await expect(page.locator('text=Analysis Summary')).toBeVisible();
  await expect(page.locator('[class*="score"]')).toBeVisible();
});

test('should handle API errors', async ({ page }) => {
  // Mock failed API
  await page.route('**/api/analyze', route => route.fulfill({
    status: 500,
    body: JSON.stringify({ success: false, error: { message: 'Error' } })
  }));
  
  await page.goto('/');
  await page.locator('textarea').fill('Test');
  await page.click('button:has-text("Analyze")');
  
  await expect(page.locator('text=/error/i')).toBeVisible();
});
```

### Test Categories
```
e2e/
├── app.spec.ts       # General app tests
│   ├── Home page display
│   ├── Theme toggle
│   ├── Navigation
│   ├── Authentication forms
│   ├── Responsive design
│   ├── Accessibility
│   └── PWA features
│
└── analysis.spec.ts  # Analysis-specific
    ├── Loading state
    ├── Results display
    ├── Export options
    ├── Share links
    ├── Error handling
    ├── Rate limiting
    └── Shared page
```

---

## 16. CI/CD Pipeline

### GitHub Actions Workflows

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint:
    # ESLint on both client and server
    
  test-server:
    # npm test on server
    # Upload coverage to Codecov
    
  test-client:
    # npm test on client
    # Playwright E2E tests
    
  build-docker:
    # Build and push Docker images
    # Only on push to main
    
  security:
    # Trivy vulnerability scan
```

### Pipeline Flow
```
Push to main
    │
    ▼
┌─────────┐    ┌─────────────┐    ┌─────────────┐
│  Lint   │───►│    Test     │───►│    Build    │
└─────────┘    └─────────────┘    └─────────────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │   Deploy    │
                                  │  (Vercel/   │
                                  │  Fly/etc)   │
                                  └─────────────┘
```

---

## 17. Security Measures

### Backend Security
```typescript
// 1. Helmet - Security headers
app.use(helmet());
// Sets: X-Content-Type-Options, X-Frame-Options, etc.

// 2. CORS - Restrict origins
app.use(cors({
  origin: ['http://localhost:5173', process.env.CLIENT_URL],
  credentials: true
}));

// 3. Rate limiting - Prevent abuse
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10               // 10 requests
});

// 4. Input validation - Joi schemas
const schema = Joi.object({
  text: Joi.string().min(10).max(5000).required()
});

// 5. SQL injection - Prisma parameterized queries
// Prisma never concatenates strings into SQL

// 6. Password hashing - bcrypt with 12 rounds
const hash = await bcrypt.hash(password, 12);

// 7. JWT - Signed tokens with expiry
jwt.sign(payload, secret, { expiresIn: '7d' });
```

### Frontend Security
```typescript
// 1. XSS - React auto-escapes
// dangerouslySetInnerHTML is never used

// 2. CSRF - Not an issue (no cookies used)
// JWT in Authorization header instead

// 3. Secrets - Never in client code
// API key is only on server
```

---

## 18. File-by-File Breakdown

### Server Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Express app setup, middleware, server start, graceful shutdown |
| `src/config/index.ts` | Environment variables with defaults, validation |
| `src/config/database.ts` | Prisma client singleton |
| `src/routes/index.ts` | All API routes with middleware chains |
| `src/controllers/authController.ts` | Register, login, me, updatePreferences handlers |
| `src/controllers/analysisController.ts` | Analyze, getById, getHistory, export, delete handlers |
| `src/controllers/analyticsController.ts` | Track events, dashboard handlers |
| `src/services/authService.ts` | Password hashing, JWT generation/verification, user CRUD |
| `src/services/analysisService.ts` | AI prompt, result normalization, database operations |
| `src/services/groqService.ts` | Groq SDK wrapper, error handling |
| `src/services/exportService.ts` | PDF generation with PDFKit, JSON formatting |
| `src/services/analyticsService.ts` | Event tracking, dashboard aggregation |
| `src/middleware/auth.ts` | requireAuth, optionalAuth JWT middleware |
| `src/middleware/validation.ts` | Joi schemas and validation middleware |
| `src/middleware/errorHandler.ts` | Global error catch, asyncHandler wrapper |
| `src/utils/logger.ts` | Winston logger with console + file transports |
| `src/utils/apiResponse.ts` | sendSuccess, sendError, Errors factory |
| `src/types/index.ts` | All TypeScript interfaces |
| `prisma/schema.prisma` | Database models: User, Analysis, Analytics |

### Client Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | React DOM render entry point |
| `src/App.tsx` | BrowserRouter, providers, routes, header/footer |
| `src/context/AuthContext.tsx` | User state, login/logout/register actions |
| `src/context/AnalysisContext.tsx` | Text/result state, analyze action |
| `src/context/ThemeContext.tsx` | Theme state, toggle, system detection |
| `src/pages/HomePage.tsx` | Main analysis UI: textarea, button, results |
| `src/pages/LoginPage.tsx` | Login form |
| `src/pages/RegisterPage.tsx` | Registration form |
| `src/pages/HistoryPage.tsx` | List of past analyses |
| `src/pages/DashboardPage.tsx` | Analytics charts and stats |
| `src/pages/SharedPage.tsx` | Public shared analysis view |
| `src/services/api.ts` | Fetch wrapper, all API methods |
| `src/types/index.ts` | TypeScript interfaces |
| `src/styles/index.css` | CSS variables, global styles |
| `e2e/app.spec.ts` | General E2E tests |
| `e2e/analysis.spec.ts` | Analysis flow E2E tests |
| `vite.config.ts` | Vite config, PWA plugin, proxy |
| `playwright.config.ts` | Playwright test configuration |

### Config Files

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript compiler options |
| `package.json` | Dependencies and scripts |
| `Dockerfile` | Production container build |
| `docker-compose.yml` | Multi-container orchestration |
| `.github/workflows/ci.yml` | CI pipeline |
| `.github/workflows/cd.yml` | CD pipeline |
| `render.yaml` | Render.com deployment config |
| `fly.toml` | Fly.io deployment config |
| `vercel.json` | Vercel deployment config |

---

## 🎓 Key Takeaways

1. **Separation of Concerns**: Controllers handle HTTP, services handle logic
2. **Type Safety**: TypeScript everywhere catches bugs early
3. **State Management**: Context + useReducer for predictable state
4. **Security**: Multiple layers (helmet, CORS, rate limit, validation)
5. **Testing**: E2E tests cover real user flows
6. **CI/CD**: Automated testing and deployment
7. **PWA**: Installable, offline-capable web app
8. **Documentation**: This file! Code is nothing without docs

---

*This documentation was generated to explain every aspect of the Argus project for portfolio presentation, technical interviews, and future development.*
