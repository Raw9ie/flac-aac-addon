FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm init -y && npm install express
COPY server.js ./
RUN mkdir -p /app/music
ENV LIBRARY_DIR=/app/music
CMD ["node", "server.js"]
