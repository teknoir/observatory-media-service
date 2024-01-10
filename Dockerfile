FROM node:21-slim

WORKDIR /usr/src/app

COPY . .

RUN npm install

EXPOSE 8000

# Run the application
CMD ["node", "index.js"]
