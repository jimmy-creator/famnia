module.exports = {
  apps: [{
    name: 'shophub',
    script: 'src/index.js',
    cwd: '/var/www/shophub/server',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
