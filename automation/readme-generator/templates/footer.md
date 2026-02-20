---

## Architecture

<img src=".github/assets/architecture.svg" width="100%" alt="Architecture Diagram"/>

| Server | Role | Key Services |
|--------|------|-------------|
| **Gateway** | AI orchestration hub | OpenClaw gateway, Reply orchestrator, Trends collector |
| **Mac Node** | Browser automation | Chrome CDP, 15 MCP servers, X/Twitter bot |
| **Web Server** | User-facing services | Mission Control, Auth, 75+ game containers, dashboards |
| **RTX 4090** | LLM inference | Ollama, 6 models (Qwen3 32B, Gemma3 27B, etc.) |
| **NAS** | Fallback inference | Ollama backup, storage |

---

## Services

<details>
<summary><strong>Mission Control</strong> — Unified command center</summary>

**Stack:** Next.js 16 · Convex · Tailwind v4 · TypeScript

The nerve center of the entire platform. A dark-themed dashboard that surfaces everything happening across all servers in real time.

**Source:** [`services/mission-control/`](services/mission-control/)

</details>

<details>
<summary><strong>Reply Orchestrator</strong> — Autonomous X/Twitter reply bot</summary>

**Stack:** Node.js · Express · Playwright · Ollama

9-stage autonomous pipeline: `INIT → SEARCH → FILTER → SCORE → SELECT → GENERATE → REFINE → REVIEW → POST`

**Source:** [`services/reply-orchestrator/`](services/reply-orchestrator/)

</details>

<details>
<summary><strong>Auth Service</strong> — Unified authentication</summary>

**Stack:** Node.js · Express · JWT · Passkey (WebAuthn) · Google OAuth · Apple Sign In

**Source:** [`services/auth-service/`](services/auth-service/)

</details>

<details>
<summary><strong>MCP Servers</strong> — 15 Model Context Protocol endpoints</summary>

15 MCP servers on ports 9001–9015: Filesystem, Memory, Brave Search, GitHub, Playwright, Puppeteer, Desktop Commander, Xcode Build, iOS Simulator, Shell Commands, Obsidian, Context7, Google Drive, Sequential Thinking, Everything.

**Source:** [`automation/mcp-servers/`](automation/mcp-servers/)

</details>

<details>
<summary><strong>Trading Bots</strong> — Polymarket + BTC prediction</summary>

Autonomous prediction market trading using multi-model LLM sentiment analysis.

**Source:** [`trading/`](trading/)

</details>

<details>
<summary><strong>Games Arcade</strong> — 75+ browser games</summary>

HTML5 games as individual Docker containers. See [`games/README.md`](games/README.md).

</details>

---

## Tech Stack

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-75%2B%20containers-2496ED?style=flat-square&logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-6%20models-black?style=flat-square)
![Playwright](https://img.shields.io/badge/Playwright-browser%20automation-45ba4b?style=flat-square&logo=playwright&logoColor=white)

</div>

---

## Getting Started

```bash
git clone https://github.com/twolfekc/wolfeup-platform.git
cd wolfeup-platform
cp .env.example .env
# Edit .env with your values

# Run Mission Control
cd services/mission-control
docker build -t mission-control .
docker run -p 5070:5070 --env-file ../../.env mission-control

# Run Reply Orchestrator
cd services/reply-orchestrator
npm install
node server.js
```

---

<div align="center">

> *This README is a living document — regenerated every 2–3 hours by `gemma3:27b` on the RTX 4090.*
> *Generator: [`automation/readme-generator/`](automation/readme-generator/)*

Made in Kansas City · Built on local hardware · Zero cloud compute

[@WolfeUpHQ](https://x.com/WolfeUpHQ)

</div>
