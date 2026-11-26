const mongoose = require('mongoose');
const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');

(async () => {
  await connectDB();
  const server = app.listen(env.PORT, () =>
    console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`)
  );

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  ['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
    shutdown('unhandledRejection');
  });
})().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
