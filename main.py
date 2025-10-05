from fastapi import FastAPI, HTTPException
import logging
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from mongo_conn import db
import json
import os
import re
from dotenv import load_dotenv
from datetime import datetime
from decimal import Decimal
from fastapi import FastAPI, HTTPException
import logging
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from mongo_conn import db
import json
import os
import re
from dotenv import load_dotenv
from datetime import datetime
from decimal import Decimal
try:
    from bson import ObjectId
except Exception:
    ObjectId = None

load_dotenv()
OLLAMA_API = os.getenv("OLLAMA_API", "http://localhost:11434/api/generate")

print(f"🔹 Using Ollama API: {OLLAMA_API}")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("text2db")

app = FastAPI(title="Text2DB AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    text: str
    collection: str

def extract_json_from_text(text: str) -> str:
    """
    Extract JSON from LLM output using regex for {...} pattern.
    """
    match = re.search(r"(\{.*\})", text, re.DOTALL)
    if match:
        return match.group(1)
    return ""

def make_json_safe(obj):
    """Recursively convert ObjectId, datetime, bytes, Decimal, and other common
    non-JSON types into JSON-serializable forms.
    """
    if ObjectId is not None and isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, bytes):
        try:
            return obj.decode('utf-8')
        except Exception:
            return str(obj)
    if isinstance(obj, Decimal):
        try:
            return float(obj)
        except Exception:
            return str(obj)

    if isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [make_json_safe(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(make_json_safe(v) for v in obj)

    return obj

def normalize_update_ops(update_obj):
    """Normalize nonstandard update operators into Mongo-friendly operators.
    Specifically, convert any occurrence of "$remove" or "remove" into "$unset`.
    Works recursively and merges multiple occurrences into a single $unset dict.
    """
    if not isinstance(update_obj, dict):
        return update_obj

    unset_accum = {}

    def recurse(obj, parent=None, parent_key=None):
        nonlocal unset_accum
        if isinstance(obj, dict):
            keys = list(obj.keys())
            for k in keys:
                v = obj.get(k)
                if k == "$remove" or k == "remove":
                    if isinstance(v, list):
                        for f in v:
                            if isinstance(f, str):
                                unset_accum[f] = ""
                    elif isinstance(v, dict):
                        for f in v.keys():
                            unset_accum[f] = ""
                    elif isinstance(v, str):
                        unset_accum[v] = ""
                    obj.pop(k, None)
                else:
                    recurse(v, obj, k)
        elif isinstance(obj, list):
            for item in obj:
                recurse(item, parent, parent_key)

    out = dict(update_obj)
    recurse(out)

    if "$unset" in out and isinstance(out["$unset"], dict):
        out["$unset"] = {**out["$unset"], **unset_accum}
    elif unset_accum:
        out["$unset"] = unset_accum

    return out

@app.post("/query")
def generate_and_run_query(req: QueryRequest):
    prompt = f"""
Convert this natural language to a MongoDB query in STRICT JSON format only.
Respond ONLY with valid JSON — no explanations, extra text, or quotes.

Natural language: "{req.text}"
Collection name: "{req.collection}"
"""

    envelope = {
        "original_text": req.text,
        "tokens": None,
        "raw_response": None,
        "clean_output": None,
        "query": None,
        "results": None,
        "error": None,
    }

    try:
        envelope["db_name"] = getattr(db, "name", os.getenv("DB_NAME"))
    except Exception:
        envelope["db_name"] = os.getenv("DB_NAME")
    envelope["collection_name"] = req.collection

    def simple_tokenize(text: str):
        try:
            b = text.encode("utf-8")
            return [f"0x{byte:02x}" for byte in b]
        except Exception:
            return [c for c in text]

    envelope["tokens"] = simple_tokenize(req.text)

    try:
        response = requests.post(
            OLLAMA_API,
            json={"model": "mistral", "prompt": prompt},
            timeout=20
        )
        response.raise_for_status()

        resp_text = response.text
        envelope["raw_response"] = resp_text

        resp_json = None
        ndjson_responses = []

        for line in resp_text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and "response" in obj:
                    ndjson_responses.append(obj.get("response") or "")
                else:
                    if resp_json is None and isinstance(obj, dict):
                        resp_json = obj
            except Exception:
                continue

        combined_output = ""
        if ndjson_responses:
            combined_output = "".join(ndjson_responses)
            combined_output = combined_output.strip()
            combined_output = combined_output.strip("` \n\r")
            envelope["raw_response"] = ndjson_responses
        else:
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
        if first_obj is not None:
            resp_json = first_obj
        print("🔹 Raw Ollama output (reconstructed):", output)
    except requests.exceptions.RequestException as e:
        envelope["error"] = f"Ollama API connection error: {str(e)}"
        logger.error("Ollama connection error: %s", json.dumps(envelope, default=str, indent=2))
        raise HTTPException(status_code=500, detail=make_json_safe(envelope))
    except Exception as e:
        envelope["error"] = f"Ollama API error: {str(e)}"
        logger.error("Ollama API error: %s", json.dumps(envelope, default=str, indent=2))
        raise HTTPException(status_code=500, detail=make_json_safe(envelope))

    clean_output = extract_json_from_text(output)
    if not clean_output:
        envelope["clean_output"] = output
        envelope["error"] = f"No valid JSON found in Ollama response"
        logger.error("No valid JSON found in Ollama response: %s", json.dumps(envelope, default=str, indent=2))
        raise HTTPException(status_code=400, detail=make_json_safe(envelope))

    try:
        decoder = json.JSONDecoder()
        mongo_query, idx = decoder.raw_decode(clean_output)
        envelope["query"] = mongo_query
        if idx < len(clean_output.strip()):
            envelope["warning"] = f"Extra data after JSON at position {idx}"
    except json.JSONDecodeError as e:
        envelope["clean_output"] = clean_output
        envelope["error"] = f"Invalid MongoDB query JSON: {str(e)}"
        logger.error("Invalid MongoDB query JSON: %s", json.dumps(envelope, default=str, indent=2))
        raise HTTPException(status_code=400, detail=make_json_safe(envelope))

    try:
        collection = db[req.collection]

        executed_filter = None
        find_kwargs = {}

        if isinstance(mongo_query, dict) and any(k in mongo_query for k in ("filter", "query", "where", "q", "find")):
            if "filter" in mongo_query:
                executed_filter = mongo_query.get("filter")
            else:
                executed_filter = mongo_query.get("query") or mongo_query.get("where") or mongo_query.get("q")
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
                sort_val = mongo_query["sort"]
                if isinstance(sort_val, dict):
                    find_kwargs["sort"] = list(sort_val.items())
                elif isinstance(sort_val, list):
                    find_kwargs["sort"] = [(s[0], s[1]) if isinstance(s, (list, tuple)) else (s, 1) for s in sort_val]
        else:
            executed_filter = mongo_query

        envelope["executed_filter"] = executed_filter
        envelope["executed_options"] = find_kwargs

        if isinstance(executed_filter, dict) and "operation" in executed_filter:
            op_val = executed_filter.pop("operation")
            logger.debug("Extracted embedded operation from executed_filter: %s", op_val)
            if isinstance(op_val, str) and op_val.lower() == "remove":
                mongo_query["remove"] = True
            elif isinstance(op_val, dict):
                if "$remove" in op_val:
                    mongo_query["remove"] = True
                else:
                    mongo_query["operation"] = op_val

        op_handled = False

        if isinstance(mongo_query, dict) and "insert" in mongo_query:
            ins = mongo_query["insert"]
            if isinstance(ins, list):
                res = collection.insert_many(ins)
                envelope["operation"] = "insert_many"
                envelope["inserted_ids"] = [str(i) for i in res.inserted_ids]
                envelope["results"] = ins
            elif isinstance(ins, dict):
                res = collection.insert_one(ins)
                envelope["operation"] = "insert_one"
                envelope["inserted_id"] = str(res.inserted_id)
                envelope["results"] = [ins]
            else:
                envelope["error"] = "Unsupported insert shape"
            op_handled = True

        if not op_handled and isinstance(mongo_query, dict) and "update" in mongo_query:
            upd = mongo_query["update"]
            filt = mongo_query.get("query") or mongo_query.get("filter") or executed_filter or {}
            upsert = bool(mongo_query.get("upsert"))

            if upsert and (not filt or filt == {}) and isinstance(upd, dict):
                try:
                    doc = dict(upd)
                    if doc.get("_id") in (None, "null"):
                        doc.pop("_id", None)
                    res = collection.insert_one(doc)
                    envelope["operation"] = "insert_one_via_upsert"
                    envelope["inserted_id"] = str(res.inserted_id)
                    envelope["results"] = [doc]
                except Exception as ie:
                    envelope["error"] = f"Insert via upsert failed: {str(ie)}"
                op_handled = True
            else: 
                try:
                    final_update = None
                    if isinstance(upd, dict) and any(k.startswith("$") for k in upd.keys()):
                        final_update = normalize_update_ops(dict(upd))
                    else:
                        final_update = {"$set": upd}

                    res = collection.update_one(filt or {}, final_update, upsert=upsert)
                    envelope["operation"] = "update_one"
                    envelope["matched_count"] = res.matched_count
                    envelope["modified_count"] = res.modified_count
                    envelope["upserted_id"] = str(res.upserted_id) if res.upserted_id else None
                    try:
                        found = list(collection.find(filt or {}, {"_id": 0}))
                        envelope["results"] = found
                    except Exception:
                        envelope["results"] = None
                except Exception as ue:
                    envelope["error"] = f"Update operation failed: {str(ue)}"
                    logger.error("Update operation failed: %s", json.dumps(envelope, default=str, indent=2))
                    raise HTTPException(status_code=400, detail=make_json_safe(envelope))
                op_handled = True

        if not op_handled and isinstance(mongo_query, dict) and any(k in mongo_query for k in (
            "delete", "delete_one", "delete_many", "remove", "remove_one", "remove_many", "justOne", "just_one"
        )):
            try:
                if "delete_many" in mongo_query or "remove_many" in mongo_query:
                    key = "delete_many" if "delete_many" in mongo_query else "remove_many"
                    df = mongo_query[key]
                    if isinstance(df, dict) and any(k in df for k in ("filter", "query", "where")):
                        df = df.get("filter") or df.get("query") or df.get("where") or {}
                    res = collection.delete_many(df or {})
                    envelope["operation"] = "delete_many"
                    envelope["deleted_count"] = res.deleted_count
                elif "delete_one" in mongo_query or "remove_one" in mongo_query:
                    key = "delete_one" if "delete_one" in mongo_query else "remove_one"
                    df = mongo_query[key]
                    if isinstance(df, dict) and any(k in df for k in ("filter", "query", "where")):
                        df = df.get("filter") or df.get("query") or df.get("where") or {}
                    res = collection.delete_one(df or {})
                    envelope["operation"] = "delete_one"
                    envelope["deleted_count"] = res.deleted_count
                else:
                    df = None
                    if "delete" in mongo_query:
                        df = mongo_query.get("delete")
                    elif "remove" in mongo_query:
                        df = mongo_query.get("remove")

                    if isinstance(df, dict) and any(k in df for k in ("filter", "query", "where")):
                        df = df.get("filter") or df.get("query") or df.get("where") or None

                    if isinstance(df, bool) and df is True:
                        df = executed_filter or {}

                    if df is None:
                        df = mongo_query.get("query") or executed_filter or {}

                    just_one = False
                    if "justOne" in mongo_query:
                        just_one = bool(mongo_query.get("justOne"))
                    elif "just_one" in mongo_query:
                        just_one = bool(mongo_query.get("just_one"))

                    if just_one:
                        res = collection.delete_one(df or {})
                        envelope["operation"] = "delete_one"
                        envelope["deleted_count"] = res.deleted_count
                    else:
                        res = collection.delete_many(df or {})
                        envelope["operation"] = "delete_many"
                        envelope["deleted_count"] = res.deleted_count

                envelope["results"] = []
                op_handled = True
            except Exception as de:
                envelope["error"] = f"Delete operation failed: {str(de)}"
                logger.error("Delete operation failed: %s", json.dumps(envelope, default=str, indent=2))
                raise HTTPException(status_code=400, detail=make_json_safe(envelope))

        if isinstance(mongo_query, dict) and "operation" in mongo_query:
            operation = mongo_query["operation"]
            if isinstance(operation, dict) and "$remove" in operation:
                mongo_query["operation"] = {"$unset": operation["$remove"]}

        if "remove" in mongo_query and "delete" not in mongo_query:
            mongo_query["delete_many"] = mongo_query.pop("remove")

        if not op_handled:
            cursor = collection.find(executed_filter or {}, {"_id": 0}, **({} if "projection" in find_kwargs else {}))
            if "projection" in find_kwargs:
                cursor = collection.find(executed_filter or {}, find_kwargs.get("projection"))
            if "sort" in find_kwargs:
                cursor = cursor.sort(find_kwargs["sort"])
            if "skip" in find_kwargs:
                cursor = cursor.skip(find_kwargs["skip"])
            if "limit" in find_kwargs:
                cursor = cursor.limit(find_kwargs["limit"])

            results = list(cursor)
            envelope["results"] = results

            return make_json_safe(envelope)
    except Exception as e:
        envelope["error"] = f"MongoDB execution error: {str(e)}"
        logger.error("MongoDB execution error: %s", json.dumps(envelope, default=str, indent=2))
        raise HTTPException(status_code=400, detail=make_json_safe(envelope))


@app.get("/test_ollama")
def test_ollama():
    try:
        res = requests.get(f"{OLLAMA_API.replace('/generate', '')}/tags", timeout=10)
        res.raise_for_status()
        return {"status": "ok", "response": res.json()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/health")
def health_check():
    return {"status": "running"}