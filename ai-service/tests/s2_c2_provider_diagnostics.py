"""Test-only sanitized diagnostics for the one-time C2 hosted evidence server."""
import json
import time
from pathlib import Path

import httpx


ALLOWED_KEYS = frozenset({
    "event", "sequence", "operation", "host", "statusCode", "statusClass", "category", "latencyMs",
    "dimensions", "returnedModelId",
})


class DiagnosticRecorder:
    def __init__(self, path):
        self.path = Path(path)
        self.events = []
        self.sequence = 0

    def _append(self, event):
        if set(event) - ALLOWED_KEYS:
            raise ValueError("diagnostic event includes a non-allowlisted field")
        self.events.append(event)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, ensure_ascii=False) + "\n")

    def record_request_started(self, host):
        self.sequence += 1
        sequence = self.sequence
        self._append({
            "event": "provider_request_started",
            "sequence": sequence,
            "operation": "embeddings",
            "host": "api.openai.com" if host == "api.openai.com" else "other",
        })
        return sequence

    def record_response(self, sequence, status_code, latency_ms):
        self._append({
            "event": "provider_response",
            "sequence": sequence,
            "statusCode": status_code,
            "statusClass": f"{status_code // 100}xx",
            "latencyMs": round(latency_ms, 3),
        })

    def record_transport_failure(self, sequence, category, latency_ms):
        self._append({
            "event": "provider_transport_failure",
            "sequence": sequence,
            "category": category,
            "latencyMs": round(latency_ms, 3),
        })

    def _events_since(self, started_at):
        return [event for event in self.events if event.get("sequence", 0) > started_at]

    def _latest_sequence_since(self, started_at):
        events = self._events_since(started_at)
        return events[-1]["sequence"] if events else None

    def failure_category_since(self, started_at):
        for event in reversed(self._events_since(started_at)):
            if event["event"] == "provider_transport_failure":
                return event["category"]
            if event["event"] == "provider_response":
                status_code = event["statusCode"]
                if status_code == 401:
                    return "http_401"
                if status_code == 429:
                    return "http_429"
                if 400 <= status_code <= 499:
                    return "http_4xx"
                if 500 <= status_code <= 599:
                    return "http_5xx"
                if 200 <= status_code <= 299:
                    return "http_2xx_adapter_rejected"
        return "unknown_before_response"

    def record_failure_since(self, started_at, latency_ms):
        category = self.failure_category_since(started_at)
        event = {
            "event": "provider_embedding_failed",
            "category": category,
            "latencyMs": round(latency_ms, 3),
        }
        sequence = self._latest_sequence_since(started_at)
        if sequence is not None:
            event["sequence"] = sequence
        self._append(event)
        return category

    def record_success_since(self, started_at, returned_model_id, dimensions, latency_ms):
        event = {
            "event": "provider_embedding_succeeded",
            "returnedModelId": returned_model_id,
            "dimensions": dimensions,
            "latencyMs": round(latency_ms, 3),
        }
        sequence = self._latest_sequence_since(started_at)
        if sequence is not None:
            event["sequence"] = sequence
        self._append(event)


class RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self, transport, recorder):
        self.transport = transport
        self.recorder = recorder

    async def handle_async_request(self, request):
        sequence = self.recorder.record_request_started(request.url.host)
        started = time.perf_counter()
        try:
            response = await self.transport.handle_async_request(request)
        except httpx.TimeoutException:
            self.recorder.record_transport_failure(sequence, "timeout", (time.perf_counter() - started) * 1000)
            raise
        except httpx.NetworkError:
            self.recorder.record_transport_failure(sequence, "network", (time.perf_counter() - started) * 1000)
            raise
        except httpx.TransportError:
            self.recorder.record_transport_failure(sequence, "transport_error", (time.perf_counter() - started) * 1000)
            raise
        self.recorder.record_response(sequence, response.status_code, (time.perf_counter() - started) * 1000)
        return response

    async def aclose(self):
        await self.transport.aclose()
