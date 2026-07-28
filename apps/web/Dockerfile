# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app

# Copy root + all workspace package.json files (npm needs them to resolve workspaces)
COPY package.json package-lock.json tsconfig.json .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/simulation-service/package.json apps/simulation-service/package.json
COPY apps/voice-server/package.json apps/voice-server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN corepack disable && npm install --ignore-scripts --legacy-peer-deps

# Copy web app source and build
COPY apps/web/ apps/web/
RUN npm run build --workspace=@convoy/web

# Stage 2: Serve
FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
