module.exports = {
  apps: [
    {
      name: "flyconnect-backend",
      cwd: "./backend",
      script: "dist/main.js",
      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "500M",
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    },
    {
      name: "flyconnect-frontend",
      cwd: "./",
      script: ".next/standalone/server.js",
      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "500M",
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
