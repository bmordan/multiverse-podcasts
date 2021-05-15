FROM node:latest
RUN mkdir -p /app
WORKDIR /app
RUN mkdir -p ./public/uploads/audio
RUN mkdir ./public/uploads/feeds
RUN mkdir ./public/uploads/image
COPY . .
RUN NODE_ENV=production npm install
EXPOSE 3333
CMD [ "npm", "run", "prod" ]