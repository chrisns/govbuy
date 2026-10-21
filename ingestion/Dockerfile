FROM python:3.15-slim@sha256:f2dbcc4d0a7ff47b0f35724b56f778ccf0460eb119542f15444ab61ddc416435
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
