# Stage 1: Build React app guna Node 24
FROM node:24-alpine AS build
WORKDIR /app

COPY src/CarWorkshop.Web/package.json src/CarWorkshop.Web/package-lock.json ./
RUN npm ci

COPY src/CarWorkshop.Web/ ./
RUN npm run build

# Stage 2: Serve static files + Reverse Proxy guna Nginx ringan (~40MB!)
FROM nginx:1.27-alpine AS final
COPY src/CarWorkshop.Web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80