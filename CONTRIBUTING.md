# Contributing — Git Workflow Guide

> **Team: please do not code directly in the `main` branch.**
>
> All work must go through feature branches → `develop` → `main`.
> Follow every step below before pushing anything.

---

## Step 1 — Clone the Repository (First Time Only)

```bash
git clone https://github.com/F4thim4h4n4/internship.git
cd kottakkal
```

---

## Step 2 — Get the Latest Code

```bash
git fetch origin
git checkout develop
git pull origin develop
```

---

## Step 3 — Move to Your Assigned Branch

### Frontend

```bash
git checkout feature/frontend
git pull origin feature/frontend
```

### Backend / API / Database

```bash
git checkout feature/backend
git pull origin feature/backend
```

### AI / Face Recognition / OCR

```bash
git checkout feature/ai
git pull origin feature/ai
```

> Work **only** in your assigned branch. Do not touch files owned by another module without asking first.

---

## Step 4 — Do Your Assigned Work

Make changes only to files within your module's scope.

---

## Step 5 — Lint Before Committing

```bash
npm run lint
```

Fix any errors before moving on.

---

## Step 6 — Add and Commit

```bash
git add .
git commit -m "feat: short description of your work"
```

### Commit Message Conventions

| Prefix | When to use |
|---|---|
| `feat:` | New feature or functionality |
| `fix:` | Bug fix |
| `docs:` | Documentation changes only |
| `config:` | Config, environment, or tooling changes |
| `refactor:` | Code restructuring without behaviour change |
| `test:` | Adding or updating tests |

**Examples:**

```bash
git commit -m "feat: add complaint form UI"
git commit -m "fix: correct attendance API validation"
git commit -m "docs: update setup instructions"
git commit -m "config: add eslint rules"
```

---

## Step 7 — Push Your Branch

```bash
# Frontend
git push origin feature/frontend

# Backend / Database
git push origin feature/backend

# AI services
git push origin feature/ai
```

---

## Step 8 — Create a Pull Request on GitHub

Open a PR on GitHub with the following target:

```
feature/frontend  →  develop
feature/backend   →  develop
feature/ai        →  develop
```

> **Do NOT create a PR directly to `main`.**

Fill in a clear PR description explaining what you changed and why.

---

## Step 9 — Review & Merge into `develop`

A team member will review your PR.  
After approval, the branch will be merged into `develop`.

---

## Step 10 — Merge into `main` (Leads Only)

Only final, verified code from `develop` will be merged into `main` after team sign-off.

---

## Important Rules

| Rule | Description |
|---|---|
| 🚫 No direct pushes to `main` | Always go through a feature branch and PR |
| 🔒 No secrets in commits | Never commit `.env`, passwords, API keys, MongoDB URIs, or backup files |
| ⬇️ Always pull before starting | Run `git pull` on your branch before writing any code |
| ✅ Lint before pushing | Run `npm run lint` and fix all errors first |
| 📝 Clear commit messages | Use the `feat:` / `fix:` / `docs:` / `config:` prefix convention |
| 🤝 Respect module ownership | Ask before changing another person's module |

---

## Branch Ownership

| Branch | Owner / Team |
|---|---|
| `feature/frontend` | Fadi Ahmed — UI/Frontend Architecture Lead |
| `feature/backend` | Muhammad Sanish — API Architecture Lead |
| `feature/database` | Fathima Hana — Database Architecture Lead |
| `feature/ai` | Muhammed Sadik KT — AI Architecture Lead |
| `feature/security` | Adithyan N — Security Architecture Lead |
| `feature/srs` | Minha Palakkathodi — SRS Architecture Lead |
| `develop` | Integration branch — merged PRs only |
| `main` | Stable release — leads only |

---

*Questions? Reach out to your team lead before pushing.*
