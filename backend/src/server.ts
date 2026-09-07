import express from "express";
import cors from "cors";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestLogger } from "./middleware/requestLogger.js";
import apiRouter from "./routes/index.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);

const startServer = async (): Promise<void> => {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`MAVI Backend running on http://localhost:${env.port}`);
  });
};

startServer();