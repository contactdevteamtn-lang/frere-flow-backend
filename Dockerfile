# API Frère Flow — image Node.js légère (aucune compilation, 2 dépendances)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Africa/Tunis
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY src ./src
COPY scripts ./scripts
# les sauvegardes chiffrées sont écrites ici (monter un volume)
RUN mkdir -p /app/sauvegardes && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/server.js"]
