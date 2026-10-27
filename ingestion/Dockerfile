FROM python:3.15-slim@sha256:2fb224844bc0ebfca5f117d1c0b93895652c8ceb01acf2c8c54c3d3a44bdcc7c
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
