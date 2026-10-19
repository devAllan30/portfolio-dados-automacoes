import mysql, { type ConnectionOptions } from "mysql2/promise";

export function openMySqlConnection() {
  const host = process.env.MYSQL_HOST?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_IMERSAO_DATABASE?.trim() || "imersao_qc";

  if (!host || !user || !password) {
    throw new Error("A conexão com o banco de indicações não está configurada.");
  }

  return mysql.createConnection({
    host,
    port: Number(process.env.MYSQL_PORT || "3306"),
    user,
    password,
    database,
    charset: "utf8mb4",
    connectTimeout: 15_000,
    disableEval: true,
  } as ConnectionOptions & { disableEval: boolean });
}
