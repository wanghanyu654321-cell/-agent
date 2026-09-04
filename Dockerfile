FROM node:22.19.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . ./
RUN npm run build

FROM node:22.19.0-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY migrations ./migrations
COPY skills ./skills
COPY --from=build /app/web/dist ./web/dist

CMD ["npm", "run", "start:enterprise"]
