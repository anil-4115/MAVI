import { createApp } from "./app.js";
import { connectDatabase, registerConnectionHandlers } from "./config/database.js";
import { env } from "./config/env.js";

const app = createApp();

const startServer = async (): Promise<void> => {
  registerConnectionHandlers();
  await connectDatabase();

  app.listen(env.port, env.listenHost, () => {
    console.log(`MAVI Backend running on http://${env.listenHost}:${env.port}`);
  });
};

startServer();