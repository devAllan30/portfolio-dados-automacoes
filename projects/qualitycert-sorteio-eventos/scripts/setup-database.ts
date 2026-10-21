import { join } from 'node:path';
import { config } from 'dotenv';
import mysql from 'mysql2/promise';

const projectDirectory = join(import.meta.dirname, '..');
config({ path: join(projectDirectory, '.env.local'), quiet: true });

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

const databaseName = requiredEnvironment('RD_DB_NAME');
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
  throw new Error('RD_DB_NAME contém caracteres inválidos.');
}

const connection = await mysql.createConnection({
  host: requiredEnvironment('RD_DB_HOST'),
  port: Number(process.env.RD_DB_PORT || 3306),
  user: requiredEnvironment('RD_DB_USER'),
  password: requiredEnvironment('RD_DB_PASSWORD'),
  charset: 'utf8mb4',
  timezone: 'Z',
});

try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  console.log(`Banco ${databaseName} disponível.`);
} finally {
  await connection.end();
}

await import('./migrate');
