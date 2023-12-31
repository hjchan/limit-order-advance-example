FROM node:18-alpine 

WORKDIR /usr/app
ARG APP=limit-order-keeper
RUN npm install -g pnpm

COPY package.json .
RUN pnpm install

COPY . .
RUN pnpm build
ENV APP_NAME ${APP}

CMD pnpm start
