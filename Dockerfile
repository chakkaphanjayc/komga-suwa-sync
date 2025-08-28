FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS build
COPY . .
RUN npm run build

FROM base AS production
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
