# Use Node.js 18 as the base image
FROM node:18-slim

# Install Python 3, pip, and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Install Python dependencies
RUN pip3 install --no-cache-dir -r python/requirements.txt --break-system-packages

# Build TypeScript
RUN npm run build

ENV PORT=3000
ENV NODE_ENV=production
ENV PYTHON_PATH=python3

EXPOSE 3000

CMD ["npm", "run", "start:sse"]
