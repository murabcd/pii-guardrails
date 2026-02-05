# NER service (Russian)

Lightweight FastAPI service using Natasha NER for Russian.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8081
```

## Example

```bash
curl -s http://localhost:8081/health

curl -s http://localhost:8081/ner \
  -H "Content-Type: application/json" \
  -d '{"text":"Привет, это Алексей из Москвы."}'
```

Response:

```json
{
  "spans": [
    {"start": 12, "end": 19, "label": "PER", "text": "Алексей"},
    {"start": 23, "end": 29, "label": "LOC", "text": "Москвы"}
  ]
}
```
