# Use Node.js with Puppeteer pre-installed
FROM ghcr.io/puppeteer/puppeteer:24.6.0

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip puppeteer chromium download since it's in base image)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/logos

# Expose port
EXPOSE 3001

# Set environment variable for port (Railway uses PORT)
ENV PORT=3001

# Start the application
CMD ["npm", "start"]
