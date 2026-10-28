FROM python:3.15-slim@sha256:80cd82871b55326f05d4c3a3b714b371b0e9833891de4be4eb4b99d3092e0029
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
