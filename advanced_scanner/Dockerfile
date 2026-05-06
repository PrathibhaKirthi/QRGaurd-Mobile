FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY server.js server.js

ENV PORT=8001
EXPOSE 8001

CMD ["npm", "start"]
