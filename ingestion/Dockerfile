FROM python:3.14-slim@sha256:e11c17f46f87983eb946b121694dedba6290ee2b0dd5294d137d82943502d179
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
