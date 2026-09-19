FROM python:3.14-slim@sha256:ef30e8ee3a7f227b0b5b39669b2e656f35b56b918c6631820357c2a55ff5a428
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
