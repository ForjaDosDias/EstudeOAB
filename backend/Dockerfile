FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src
COPY tests ./tests
COPY jest.config.js ./

EXPOSE 3001

CMD ["node", "src/server.js"]
