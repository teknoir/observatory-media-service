FROM node:21-slim

WORKDIR /usr/src/app

COPY . .

# Install FFmpeg with libfreetype support
RUN apt-get update && apt-get install -y ffmpeg

RUN npm install


EXPOSE 8000

# Run the application
CMD ["node", "index.js"]
