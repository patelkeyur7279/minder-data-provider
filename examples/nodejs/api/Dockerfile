FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port (matches PORT in .env.example / src/index.ts default)
EXPOSE 3001

# Start development server
CMD ["npm", "run", "dev"]
