module.exports = {
  apps: [
    {
      name: "automacao-indicacoes",
      cwd: `${__dirname}/..`,
      script: "scripts/iniciar-producao.mjs",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
