# 🤖 AI Code Reviewer

An AI-powered GitHub PR code reviewer using the MERN stack and Groq LLM (`llama-3.3-70b-versatile`).

When a PR is opened or updated, GitHub sends a webhook → the server fetches the diff → Groq reviews it → inline comments are posted back to the PR → everything is saved to MongoDB and shown on the React dashboard.

---

## Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Frontend  | React 18 + Vite + Tailwind CSS + Recharts           |
| Backend   | Node.js + Express (ES Modules)                      |
| Database  | MongoDB + Mongoose                                  |
| AI        | Groq SDK — `llama-3.3-70b-versatile`                |
| GitHub    | `@octokit/rest` + `@octokit/auth-app` (App auth)   |
| Auth      | JWT + bcryptjs                                      |
| Tunneling | ngrok (local dev)                                   |

---

## Quick Start

### 1. Clone & install

```bash
# Install server deps
cd server && npm install

# Install client deps
cd ../client && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in all values in .env
```

Required values:

| Variable                | Description                                                     |
|-------------------------|-----------------------------------------------------------------|
| `GROQ_API_KEY`          | From https://console.groq.com                                   |
| `GITHUB_TOKEN`          | PAT with `repo` scope — **dev only**, use GitHub App in prod    |
| `GITHUB_WEBHOOK_SECRET` | Any random string — paste into GitHub Webhook settings          |
| `MONGO_URI`             | MongoDB Atlas connection string                                 |
| `JWT_SECRET`            | Any long random string                                          |

### 3. Create your dashboard user

```bash
# While server is running:
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'
```

> **Note**: `/api/auth/register` is disabled when `NODE_ENV=production` and `ALLOW_REGISTRATION` is not set.
> To create the first admin user in production: temporarily set `ALLOW_REGISTRATION=true`, register, then remove the env var.

> 💡 **Hiring Managers / Guest Access (Demo Mode)**: 
> You can bypass registration entirely by clicking the **Try Demo Mode** button on the Login page. This automatically logs you in as a guest (`demo` user) and seeds MongoDB with realistic, pre-populated PR reviews (security concerns, performance suggestions, style fixes) so you can explore a fully functioning dashboard right away.

### 4. Run locally

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev

# Terminal 3 — expose backend for GitHub webhooks
npx ngrok http 5000
```

### 5. Set up GitHub Webhook (5-minute guide)

This exposes your local server to the internet so GitHub can deliver PR events.

#### Step 1 — Install ngrok (one time)

```bash
# macOS
brew install ngrok

# Windows (via Chocolatey)
choco install ngrok

# Or download directly: https://ngrok.com/download
# Then sign up for a free account and run:
ngrok config add-authtoken <YOUR_NGROK_TOKEN>
```

#### Step 2 — Start the tunnel

```bash
ngrok http 5000
```

You'll see output like:

```
Forwarding  https://a1b2-203-0-113-42.ngrok-free.app -> http://localhost:5000
```

Copy the **HTTPS** URL (the one starting with `https://`).

#### Step 3 — Configure the GitHub webhook

1. Go to your target GitHub repository
2. Click **Settings → Webhooks → Add webhook**
3. Fill in the form:

| Field | Value |
|-------|-------|
| **Payload URL** | `https://a1b2-203-0-113-42.ngrok-free.app/api/webhook/github` |
| **Content type** | `application/json` |
| **Secret** | Exact value of `GITHUB_WEBHOOK_SECRET` from your `.env` |
| **Which events?** | Select **Let me select individual events** → tick **Pull requests** only |
| **Active** | ✅ checked |

4. Click **Add webhook**
5. GitHub will send a ping event — you should see `200 OK` in the Recent Deliveries tab

#### Step 4 — Test it

Open a new PR (or push a new commit to an existing PR) in that repository. Within a few seconds you'll see the AI review comments appear on the PR.

> [!NOTE]
> **ngrok free tier**: the tunnel URL changes every restart. Re-paste the new URL into GitHub's webhook settings each time you restart ngrok. Upgrade to a paid ngrok plan to get a stable hostname.

Now open (or re-sync) a PR — the AI review will appear within seconds!

---

## GitHub App Setup (Production)

The server supports two GitHub auth modes. Use a **PAT** locally, **GitHub App** in production.

### Why GitHub App?
- Fine-grained repository permissions (not your personal account)
- Installation tokens auto-rotate (no expiry surprises)
- Same pattern used by CodeRabbit, Mergify, Renovate

### Steps

1. **Create the App** — go to https://github.com/settings/apps/new
   - Name: `AI Code Reviewer`
   - Homepage URL: your backend URL
   - Webhook URL: your ngrok or Render URL + `/api/webhook/github`
   - Webhook secret: value of `GITHUB_WEBHOOK_SECRET`
   - Permissions → Repository → **Pull requests: Read & Write**, **Contents: Read**
   - Subscribe to events: **Pull request**

2. **Note the App ID** — shown at the top of the App settings page

3. **Generate a private key** — scroll to the bottom, click **Generate a private key**
   - Download the `.pem` file
   - Convert to a single-line string for the env var:
   ```bash
   # macOS / Linux
   cat private-key.pem | tr '\n' '\\n'
   # Windows (PowerShell)
   (Get-Content private-key.pem -Raw) -replace "`n", "\n"
   ```
   - Paste the output as `GITHUB_APP_PRIVATE_KEY` in your `.env`

4. **Install the App on your repo** — in App settings → Install App → select the target repo
   - The URL after install will contain the **Installation ID**:
     `https://github.com/settings/installations/12345678` → ID is `12345678`

5. **Set env vars**:
   ```env
   GITHUB_APP_ID=123456
   GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n
   GITHUB_INSTALLATION_ID=12345678
   ```
   Leave `GITHUB_TOKEN` empty — the server prefers App auth when all three vars are set.

---

## Project Structure

```
├── client/               # React frontend (Vite + Tailwind)
│   └── src/
│       ├── pages/        # Login, Dashboard, ReviewDetail
│       ├── components/   # CommentCard, SeverityBadge, StatsBar, RepoFilter
│       ├── hooks/        # useReviews
│       └── lib/api.js    # Axios client
└── server/
    ├── models/           # Review.js, User.js (Mongoose)
    ├── routes/           # webhook.js, reviews.js, auth.js
    ├── services/         # ai.js, diffParser.js, commentPoster.js, aiReview.js,
    │                     # githubClient.js (App + PAT auth)
    ├── middleware/       # verifyWebhook.js, authMiddleware.js
    └── server.js
```

---

## Deployment

### Option A: Deploy Frontend + Backend Together on Vercel (Monorepo Setup)

You can deploy the entire stack as a single project on Vercel using the root-level `vercel.json` configuration provided.

1. Import the repository into Vercel.
2. Select **Other** as the framework preset (since Vercel will auto-detect configurations from `vercel.json`).
3. Add the following **Environment Variables** in the Vercel dashboard:
   - `GROQ_API_KEY`: Your Groq API key.
   - `GITHUB_TOKEN` (or App credentials): Your GitHub PAT or GitHub App secrets.
   - `GITHUB_WEBHOOK_SECRET`: Your webhook secret.
   - `MONGO_URI`: Your MongoDB Atlas URI.
   - `JWT_SECRET`: A long random string.
   - `NODE_ENV`: `production`
4. Click **Deploy**. Vercel will build the React static assets and mount the Express backend as serverless functions.
5. In your GitHub repository settings, update the Webhook URL to: `https://your-vercel-deployment-url.vercel.app/api/webhook/github`

### Option B: Split Deployment (Frontend on Vercel, Backend on Render/Railway)

#### Backend (Render / Railway)
- Set all env vars in the platform dashboard
- Start command: `node server/server.js`
- Set `NODE_ENV=production`

#### Frontend (Vercel)
- Root: `client/`
- Build: `npm run build`
- Output: `dist/`
- Env var: `VITE_API_URL=https://your-backend-url.onrender.com/api`

#### Database (MongoDB Atlas)
- Free M0 tier works fine
- Whitelist `0.0.0.0/0` (allow access from anywhere) in MongoDB network settings so serverless functions can connect.

---

## API Endpoints

| Method | Path                         | Auth | Description                              |
|--------|------------------------------|------|------------------------------------------|
| POST   | `/api/webhook/github`        | —    | GitHub webhook receiver                  |
| POST   | `/api/auth/login`            | —    | Login, returns JWT                       |
| POST   | `/api/auth/register`         | —    | Create user (dev only)                   |
| GET    | `/api/reviews`               | JWT  | Paginated review list                    |
| GET    | `/api/reviews/stats`         | JWT  | Aggregate severity counts                |
| GET    | `/api/reviews/stats/trend`   | JWT  | Daily severity counts (trend chart data) |
| GET    | `/api/reviews/:id`           | JWT  | Single review detail                     |
| POST   | `/api/reviews/:id/rerun`     | JWT  | Re-trigger AI review pipeline            |

## Dashboard Features

- **Stats bar** — total reviews, bugs, security issues, performance warnings
- **Issues by severity** — bar chart breakdown (Recharts)
- **Top repositories** — ranked by issue count
- **Severity trend** — line chart over last 7 / 30 / 90 days, per-severity lines
- **Review list** — paginated, filterable by repo and severity, ↺ re-run per row
- **Review detail** — PR metadata, severity filter tabs, comments grouped by file, ↺ re-run button
