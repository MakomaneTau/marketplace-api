# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.18.0

FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /usr/src/app

# Install production dependencies first so this layer remains cached when only
# application source files change.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# Keep application files owned by the non-root user provided by the Node image.
COPY --chown=node:node src ./src

USER node

EXPOSE 4000

CMD ["node", "src/server.js"]
