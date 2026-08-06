FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src
COPY tests ./tests
COPY jest.config.js ./
# scripts/ ficou de fora até 06/08/2026 — os comandos documentados como
# `docker exec estudeoab-backend-1 node scripts/<nome>.js` falhavam com
# MODULE_NOT_FOUND porque a pasta nunca chegava na imagem.
COPY scripts ./scripts

EXPOSE 3001

CMD ["node", "src/server.js"]
