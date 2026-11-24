FROM python:3.15-slim@sha256:2c879838405817bd51e53c75ab78f613f446c448070c2d70e2e99639705bd409
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
