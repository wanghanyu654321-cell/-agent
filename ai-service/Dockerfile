FROM python:3.11.15-slim-bookworm@sha256:d29f48a31a8b408ed19272ca1e7b10ebae13b240a27e862d3d4217c528e2e0c3
WORKDIR /service
ENV PYTHONDONTWRITEBYTECODE=1
COPY ai-service/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --timeout 180 --retries 10 -r requirements.txt
COPY ai-service/rag_service ./rag_service
USER 65534:65534
CMD ["python", "-m", "uvicorn", "rag_service.bootstrap:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
