FROM python:3.15-slim@sha256:1c670c3568107e243bfd05457ad9ca0b11c35a855c985af73e4452db9a714e70
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
ENTRYPOINT ["govbuy-ingest"]
CMD ["refresh"]
