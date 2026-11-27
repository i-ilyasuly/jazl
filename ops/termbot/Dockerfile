# Medeo терминал-боты: gcloud + git + node + jq + psql (Cloud Shell-дегі негізгі құралдар)
FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs git curl jq postgresql-client openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && mkdir -p /workspace
WORKDIR /app
COPY bot.mjs .
ENV NODE_ENV=production
CMD ["node", "bot.mjs"]
