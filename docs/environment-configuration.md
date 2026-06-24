# Environment Configuration Guide

This document describes the environment variable configurations for the **Smart Municipal Citizen Assistance and Staff Attendance Management System**. Standardizing these variables ensures the application behaves consistently across Development, Testing, and Production environments while protecting sensitive API credentials and connection strings.

---

## Environment Variable Naming Conventions

To keep configurations clean and predictable, we adhere to the following naming conventions:
- **Case**: All environment variable keys must be written in **UPPERCASE_SNAKE_CASE**.
- **Frontend Variables**: Vite requires all browser-accessible environment variables to be prefixed with `VITE_`. Any variable without this prefix will *not* be loaded into the React application context.
- **Backend & AI Variables**: Standard variables without prefixes (e.g. `PORT`, `MONGODB_URI`, `GEMINI_API_KEY`).

---

## 1. Backend Environment Variables

The backend runs on Node.js / Express. The template is located at [backend/.env.example](file:///c:/Users/muham/OneDrive/Documents/internship/github-internship/backend/.env.example).

| Variable Name | Required? | Default / Example Value | Description & Security Guidelines |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | **Yes** | `development` | Defines the environment mode. Set to `production` in live environments or `test` for automated suites. |
| `PORT` | **Yes** | `5000` | The local port the Express application server listens on. |
| `MONGODB_URI` | **Yes** | `mongodb+srv://...` | The database connection string. **Security:** Contains credentials. Must never be committed to git. Access should be restricted via IP allowlisting in MongoDB Atlas. |
| `JWT_SECRET` | **Yes** | *[Generative]* | Symmetric key used to sign session JSON Web Tokens. **Security:** Must be a cryptographically secure random string (minimum 32 bytes) in production. |
| `JWT_EXPIRES_IN` | **Yes** | `7d` | Lifespan of the generated JWT. Use ms format (e.g. `'2h'`, `'7d'`). |
| `CORS_ORIGIN` | **Yes** | `http://localhost:3000` | Allowed origin for frontend requests. In production, set this to the specific React App domain (e.g. `https://citizen.municipality.gov`). |
| `LOG_LEVEL` | No | `info` | Minimum severity level for log recording. Choices: `error`, `warn`, `info`, `debug`. |
| `FACE_RECOGNITION_THRESHOLD` | **Yes** | `0.8` | Confidence cutoff value for verification matching. Range `0.0` - `1.0`. |
| `TRACKING_REFERENCE_PREFIX` | **Yes** | `MC` | Character prefix prepended to all citizen tracking IDs (e.g., MC-2026-0001). |
| `SMTP_HOST` | No | `smtp.mailtrap.io` | SMTP mail server hostname for notifications. |
| `SMTP_PORT` | No | `587` | SMTP mail server connection port. |
| `SMTP_USER` | No | *[User Email]* | Authentication username for the SMTP gateway. |
| `SMTP_PASSWORD` | No | *[Secret]* | Authentication password or App Password for the SMTP server. |

---

## 2. Frontend Environment Variables

The frontend is a React application built with Vite. The template is located at [frontend/.env.example](file:///c:/Users/muham/OneDrive/Documents/internship/github-internship/frontend/.env.example).

| Variable Name | Required? | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | **Yes** | `http://localhost:5000/api` | The base URL of the Backend Gateway. Vite injects this URL during the build phase. |
| `VITE_APP_NAME` | **Yes** | `Smart Municipal Assistant` | Custom branding name shown in the UI header and metadata. |
| `VITE_ENABLE_CHATBOT` | **Yes** | `true` | Boolean feature toggle to show/hide the AI Chatbot workspace. |
| `VITE_ENABLE_ATTENDANCE` | **Yes** | `true` | Boolean feature toggle to show/hide the staff biometric attendance page. |
| `VITE_ENABLE_FILE_TRACKING` | **Yes** | `true` | Boolean feature toggle to show/hide the Application/File Tracking portal. |
| `VITE_DEFAULT_LANGUAGE` | **Yes** | `en` | Default language loaded. Recommended values: `en`, `ml`. |

---

## 3. AI Module Environment Variables

The AI services run as a dedicated module. The template is located at [ai-services/.env.example](file:///c:/Users/muham/OneDrive/Documents/internship/github-internship/ai-services/.env.example).

| Variable Name | Required? | Default / Example Value | Description & Security Guidelines |
| :--- | :---: | :--- | :--- |
| `GEMINI_API_KEY` | **Yes** | *[API Key]* | Access token for the Google Gemini API. **Security:** Must be kept highly confidential. Never expose to client-side code. |
| `MODEL_NAME` | **Yes** | `gemini-2.5-pro` | Gemini model engine designation for chat. |
| `TEMPERATURE` | **Yes** | `0.7` | Temperature setting (randomness). Range `0.0` - `1.0`. Lower values are more deterministic. |
| `MAX_TOKENS` | **Yes** | `2048` | Limits the maximum tokens produced per response to control costs. |
| `DEFAULT_LANGUAGE` | **Yes** | `en` | Default translation/chat fallback language. |
| `SUPPORTED_LANGUAGES` | **Yes** | `en,ml` | Comma-separated list of active locales for multilingual support. |
| `OCR_ENABLED` | **Yes** | `true` | Toggles the active status of OCR document parsing on upload. |

---

## Setup Instructions

### A. Development Environment

Follow these steps to configure your local environment:

1. **Copy the Configuration Templates**
   Navigate to each module directory and copy the `.env.example` file to `.env`:
   ```bash
   # Backend
   cp backend/.env.example backend/.env

   # Frontend
   cp frontend/.env.example frontend/.env

   # AI Services
   cp ai-services/.env.example ai-services/.env
   ```

2. **Generate a JWT Secret Key**
   For local development, generate a cryptographically strong secret using the Node.js shell:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste this value into `backend/.env` under the `JWT_SECRET` key.

3. **Insert API Keys and DB URIs**
   - Populate `MONGODB_URI` in `backend/.env` with your local MongoDB instance or MongoDB Atlas Dev cluster URI.
   - Populate `GEMINI_API_KEY` in `ai-services/.env` with your developer API key.

---

### B. Production Deployment

In a production environment, `.env` files should **not** be deployed directly onto host instances. Use secure cloud native configuration injectors:

1. **Secrets Management**
   - Store highly sensitive secrets (`MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `SMTP_PASSWORD`) in a dedicated vaults manager (e.g. AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault).
   - Inject these variables as runtime environment parameters at container launch or server startup.

2. **Environment Variable Injection in CI/CD**
   - In platforms like GitHub Actions, Vercel, Netlify, or Docker Swarm, define the environment variables in the admin dashboard settings under **Secrets/Variables**.
   - Make sure `NODE_ENV` is explicitly set to `production` to activate compiler and database optimizations.

3. **Vite Frontend Builds**
   - Vite embeds variables prefixed with `VITE_` into static HTML/JS files during compilation. 
   - Ensure the variables are defined in the build server environment (e.g., GitHub Actions Runner) *before* executing `npm run build`.

---

## Security Recommendations

1. **Prevent Codebase Contamination**
   Never place plaintext connection strings or API keys inside source code files. Ensure your local environment variables are loaded dynamically using libraries like `dotenv` in Node.js or `os.environ` in Python.
   
2. **Commit Gatekeeping**
   Ensure `.gitignore` is properly configured. You can check if any `.env` file is accidentally indexed by running:
   ```bash
   git status --ignored
   ```
   If a secret is ever committed, rotate the secret immediately and use tools like `git-filter-repo` to purge it from git history.

3. **Principle of Least Privilege**
   - **Database**: Create database users specifically for the backend application, granting read/write access only to necessary collections. Avoid using cluster admin database users.
   - **Gemini Key**: Restrict Gemini API keys to only run model calls; do not grant project owner roles.
