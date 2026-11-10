module.exports = {
  apps: [
    {
      name: "indicacoes-napratica",
      cwd: `${__dirname}/..`,
      script: "scripts/start-production.mjs",
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

