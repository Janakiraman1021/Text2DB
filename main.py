from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from mongo_conn import db
import json
import os
import re
from dotenv import load_dotenv


# ---------------------
# Load environment variables
# ---------------------
load_dotenv()
OLLAMA_API = os.getenv("OLLAMA_API", "http://localhost:11434/api/generate")

print(f"🔹 Using Ollama API: {OLLAMA_API}")


# ---------------------
# Initialize FastAPI
# ---------------------
app = FastAPI(title="Text2DB AI")


# ---------------------
# Enable CORS
# ---------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # replace "*" with frontend URL in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------
# Request schema
# ---------------------
class QueryRequest(BaseModel):
    text: str
    collection: str


# ---------------------
# Helper: Extract JSON from LLM output
# ---------------------
def extract_json_from_text(text: str) -> str:
    """
    Extract JSON from LLM output using regex for {...} pattern.
    """
    match = re.search(r"(\{.*\})", text, re.DOTALL)
    if match:
        return match.group(1)
    return ""


# ---------------------
# POST endpoint: Text → MongoDB Query
# ---------------------
@app.post("/query")
def generate_and_run_query(req: QueryRequest):
    prompt = f"""
Convert this natural language to a MongoDB query in STRICT JSON format only.
Respond ONLY with valid JSON — no explanations, extra text, or quotes.

Natural language: "{req.text}"
Collection name: "{req.collection}"
"""

    # Prepare response envelope
    envelope = {
        "original_text": req.text,
        "tokens": None,
        "raw_response": None,
        "clean_output": None,
        "query": None,
        "results": None,
        "error": None,
    }

    # include DB and collection names
    try:
        envelope["db_name"] = getattr(db, "name", os.getenv("DB_NAME"))
    except Exception:
        envelope["db_name"] = os.getenv("DB_NAME")
    envelope["collection_name"] = req.collection

    # Helper: simple fallback tokenization
    def simple_tokenize(text: str):
        try:
            # Return list of utf-8 byte hex values as a reproducible token-like representation
            b = text.encode("utf-8")
            return [f"0x{byte:02x}" for byte in b]
        except Exception:
            return [c for c in text]

    # Compute tokens for the input text
    envelope["tokens"] = simple_tokenize(req.text)

    # Call Ollama API
    try:
        response = requests.post(
            OLLAMA_API,
            json={"model": "mistral", "prompt": prompt},
            timeout=20  # avoid hanging
        )
        response.raise_for_status()

        # Capture raw text first (some LLM servers return non-JSON or newline-delimited JSON)
        resp_text = response.text
        envelope["raw_response"] = resp_text

        # Try structured parsing first
        resp_json = None
        ndjson_responses = []

        # If the server returned multiple JSON objects (NDJSON/stream), parse line-by-line
        for line in resp_text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                # If object contains a 'response' field, collect it (streamed chunk)
                if isinstance(obj, dict) and "response" in obj:
                    ndjson_responses.append(obj.get("response") or "")
                else:
                    # keep as candidate structured JSON
                    if resp_json is None and isinstance(obj, dict):
                        resp_json = obj
            except Exception:
                # not a JSON line; ignore
                continue

        combined_output = ""
        if ndjson_responses:
            # Concatenate streamed response parts in order
            combined_output = "".join(ndjson_responses)
            # sanitize leading/trailing code fences and whitespace
            combined_output = combined_output.strip()
            combined_output = combined_output.strip("` \n\r")
            envelope["raw_response"] = ndjson_responses
        else:
            # fallback: try to parse whole response as JSON once
            try:
                resp_json = response.json()
            except Exception:
                resp_json = None
            if isinstance(resp_json, dict) and ("response" in resp_json or "output" in resp_json):
                combined_output = resp_json.get("response") or resp_json.get("output") or json.dumps(resp_json)
                envelope["raw_response"] = resp_json
            else:
                combined_output = resp_text
                envelope["raw_response"] = resp_text

        output = (combined_output or "").strip()
        # Try to find the first JSON object within the reconstructed output by locating the first '{'
        first_obj = None
        cleaned_json_text = ""
        pos = output.find("{")
        if pos != -1:
            try:
                decoder = json.JSONDecoder()
                first_obj, idx = decoder.raw_decode(output[pos:])
                cleaned_json_text = output[pos: pos + idx]
            except Exception:
                first_obj = None
                cleaned_json_text = output
        else:
            cleaned_json_text = output

        envelope["clean_output"] = cleaned_json_text
        # if we successfully parsed a structured object from the reconstructed stream, prefer it
        if first_obj is not None:
            resp_json = first_obj
        print("🔹 Raw Ollama output (reconstructed):", output)
    except requests.exceptions.RequestException as e:
        envelope["error"] = f"Ollama API connection error: {str(e)}"
        raise HTTPException(status_code=500, detail=envelope)
    except Exception as e:
        envelope["error"] = f"Ollama API error: {str(e)}"
        raise HTTPException(status_code=500, detail=envelope)

    # Clean output to extract JSON only
    clean_output = extract_json_from_text(output)
    if not clean_output:
        envelope["clean_output"] = output
        envelope["error"] = f"No valid JSON found in Ollama response"
        # Return envelope with error info instead of raising
        raise HTTPException(status_code=400, detail=envelope)

    # Convert JSON string to Python dict: parse first JSON object even if extra data follows
    try:
        decoder = json.JSONDecoder()
        mongo_query, idx = decoder.raw_decode(clean_output)
        envelope["query"] = mongo_query
        # if extra data exists after the JSON object, note it in envelope but still proceed
        if idx < len(clean_output.strip()):
            envelope["warning"] = f"Extra data after JSON at position {idx}"
    except json.JSONDecodeError as e:
        envelope["clean_output"] = clean_output
        envelope["error"] = f"Invalid MongoDB query JSON: {str(e)}"
        raise HTTPException(status_code=400, detail=envelope)

    # Execute query on MongoDB
    try:
        collection = db[req.collection]

        # If the LLM returned a wrapper (e.g., { filter: {...}, limit: 10, sort: [...] }), normalize it
        executed_filter = None
        find_kwargs = {}

        if isinstance(mongo_query, dict) and any(k in mongo_query for k in ("filter", "query", "where", "q", "find")):
            # support several common wrapper keys
            # If it's a find wrapper like { "find": "users", "filter": { ... } }
            if "filter" in mongo_query:
                executed_filter = mongo_query.get("filter")
            else:
                executed_filter = mongo_query.get("query") or mongo_query.get("where") or mongo_query.get("q")
            # projection
            if "projection" in mongo_query and isinstance(mongo_query["projection"], dict):
                find_kwargs["projection"] = mongo_query["projection"]
            if "limit" in mongo_query:
                try:
                    find_kwargs["limit"] = int(mongo_query["limit"])
                except Exception:
                    pass
            if "skip" in mongo_query:
                try:
                    find_kwargs["skip"] = int(mongo_query["skip"])
                except Exception:
                    pass
            if "sort" in mongo_query:
                # allow sort as list of [ [field, 1], ... ] or dict {field: 1}
                sort_val = mongo_query["sort"]
                if isinstance(sort_val, dict):
                    find_kwargs["sort"] = list(sort_val.items())
                elif isinstance(sort_val, list):
                    find_kwargs["sort"] = [(s[0], s[1]) if isinstance(s, (list, tuple)) else (s, 1) for s in sort_val]
        else:
            executed_filter = mongo_query

        # Record what we'll execute
        envelope["executed_filter"] = executed_filter
        envelope["executed_options"] = find_kwargs

        # Perform the find with options; handle limit via cursor.limit
        cursor = collection.find(executed_filter or {}, {"_id": 0}, **({} if "projection" in find_kwargs else {}))
        # apply projection if provided separately
        if "projection" in find_kwargs:
            # pymongo allows projection in find; we already passed projection separately if needed
            cursor = collection.find(executed_filter or {}, find_kwargs.get("projection"))
        if "sort" in find_kwargs:
            cursor = cursor.sort(find_kwargs["sort"])
        if "skip" in find_kwargs:
            cursor = cursor.skip(find_kwargs["skip"])
        if "limit" in find_kwargs:
            cursor = cursor.limit(find_kwargs["limit"])

        results = list(cursor)
        envelope["results"] = results
        return envelope
    except Exception as e:
        envelope["error"] = f"MongoDB execution error: {str(e)}"
        raise HTTPException(status_code=400, detail=envelope)


@app.get("/test_ollama")
def test_ollama():
    try:
        res = requests.get(f"{OLLAMA_API.replace('/generate', '')}/tags", timeout=10)
        res.raise_for_status()
        return {"status": "ok", "response": res.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ---------------------
# GET endpoint: Health check
# ---------------------
@app.get("/health")
def health_check():
    return {"status": "running"}