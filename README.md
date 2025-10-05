# Text2DB (t2d)

A developer tool that converts natural language queries into MongoDB queries using an LLM (via Ollama), executes them against a MongoDB instance, and displays results in a futuristic UI.

This repository contains:
- Backend: FastAPI app that talks to an LLM (Ollama) and MongoDB.
- Frontend: Next.js + Tailwind UI with a synth/futuristic design and a query console.

Features
- Natural language → MongoDB query generation (via Ollama)
- NDJSON/stream-safe parsing of LLM output
- Executes queries safely against MongoDB and returns results
- Shows tokens, raw LLM output, cleaned output, executed filter and options, and errors in a debug pane
- Stores DB and collection context and displays it in the UI

Quick start
1. Backend
- Create a `.env` in the project root with the following variables:

```
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.mongodb.net
DB_NAME=text2db
OLLAMA_API=http://localhost:11434/api/generate
```

- Install Python deps and run:

```powershell
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

2. Frontend
- From `frontend/`:

```powershell
pnpm install
pnpm dev
# or
npm install
npm run dev
```

Routes
- `/` — Main query console
- `/working` — Working/How it works page
- `/features` — Feature list
- `/about` — About page

Development notes
- The backend reconstructs streamed NDJSON responses from Ollama and extracts the first JSON object as the query. If the LLM returns metadata first, the backend now detects and picks the actual filter body.
- Tokenization is currently a UTF-8 byte-level fallback. To use model tokens, install and wire `tiktoken` or `transformers`.

Security
- CORS is wide open by default. Limit origins in production.
- Validate and sanitize all LLM outputs before running in production.

Troubleshooting
- If the LLM returns `Extra data` errors, the app reconstructs NDJSON streams and will show the raw data in the LLM Debug pane.
- If results are empty, check the `Executed Filter` in the LLM Debug pane for case mismatches or field-name mismatches.

Contributing
- Open issues, and PRs are welcome.

License
- MIT
