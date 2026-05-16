# Slim image: only Plaid webhook relay (no Electron / Next).
# Build from IntentFlow/:  docker build -f deployment/plaid-relay/Dockerfile -t intentflow-plaid-relay .
FROM node:22-alpine
WORKDIR /app

COPY deployment/plaid-relay/package.json deployment/plaid-relay/package-lock.json ./
RUN npm ci --omit=dev

COPY scripts/plaid-webhook-relay.cjs scripts/
COPY scripts/lib/plaidWebhookVerify.cjs scripts/lib/

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787

EXPOSE 8787
CMD ["node", "scripts/plaid-webhook-relay.cjs"]
