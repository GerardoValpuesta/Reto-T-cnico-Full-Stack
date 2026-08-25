import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/talleres_db',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key-for-talleres-2026',
  nodeEnv: process.env.NODE_ENV || 'development',
};
