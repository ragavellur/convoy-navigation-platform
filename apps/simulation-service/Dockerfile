FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json ./
RUN npm install --production

COPY index.js ./
COPY scripts/ ./scripts/

EXPOSE 3002

CMD ["node", "index.js"]
