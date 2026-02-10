from typing import List

from fastapi import FastAPI
from pydantic import BaseModel
from natasha import Doc, NewsEmbedding, NewsNERTagger, Segmenter

app = FastAPI(title="pii-guardrails-ner", version="0.1.0")

segmenter = Segmenter()
emb = NewsEmbedding()
ner_tagger = NewsNERTagger(emb)


class NerRequest(BaseModel):
    text: str


class NerSpan(BaseModel):
    start: int
    end: int
    label: str
    text: str


class NerResponse(BaseModel):
    spans: List[NerSpan]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ner", response_model=NerResponse)
def ner(request: NerRequest) -> NerResponse:
    doc = Doc(request.text)
    doc.segment(segmenter)
    doc.tag_ner(ner_tagger)

    spans: List[NerSpan] = []
    for span in doc.spans:
        spans.append(
            NerSpan(
                start=span.start,
                end=span.stop,
                label=span.type,
                text=span.text,
            )
        )

    return NerResponse(spans=spans)
