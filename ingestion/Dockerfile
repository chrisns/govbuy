FROM python:3.15-slim@sha256:f11aa5dc9fad216f005cf34262f3f7dedc2369f03bbbd916589c24346519ee3b
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
