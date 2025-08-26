FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite reads VITE_* from .env.production at build time
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm i -g serve
COPY --from=build /app/dist ./dist
EXPOSE 8080
# Bind explicitly to 0.0.0.0 so Fly proxy can reach the container
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:8080"]
