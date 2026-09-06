import express from "express";

const app = express();

const PORT = 5000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "MAVI Backend is running successfully",
  });
});

app.listen(PORT, () => {
  console.log(`MAVI Backend running on http://localhost:${PORT}`);
});