const projectRoot = `${__dirname}\\..`;

module.exports = {
  apps: [
    {
      name: "indicacoes-napratica",
      cwd: projectRoot,
      script: "scripts/start-production.mjs",
      interpreter: "node",
      node_args: "--env-file=.env.local",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      time: true,
    },
  ],
};
