# Docker Setup

Simple Docker setup for the Bosta Library Management System.

## Quick Start

1. **Start the application:**

   ```bash
   docker-compose up -d
   ```

2. **View logs:**

   ```bash
   docker-compose logs -f app
   ```

3. **Stop the application:**
   ```bash
   docker-compose down
   ```

The application will be available at `http://localhost:3000`

## Services

- **app**: Node.js application (port 3000)
- **postgres**: PostgreSQL database (port 5432)

## Common Commands

```bash
# Build and start
docker-compose up --build

# Stop and remove everything
docker-compose down -v

# Access app container
docker-compose exec app sh

# Access database
docker-compose exec postgres psql -U bosta_user -d bosta_db

# Run migrations
docker-compose exec app npx prisma migrate deploy

# View logs
docker-compose logs app
```

## Environment Variables

Update the environment variables in `docker-compose.yml` for production:

- Change `JWT_SECRET` to a secure value
- Change `POSTGRES_PASSWORD` to a secure password
