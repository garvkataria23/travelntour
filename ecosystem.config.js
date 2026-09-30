module.exports = {
  apps: [
    {
      name: "flyconnect-backend",
      cwd: "./backend",
      script: "dist/main.js",
      instances: "max",
      exec_mode: "cluster",
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
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
