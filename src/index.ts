import express, { raw, Request, Response } from "express";
import { scrapeAmazon } from "./vendor";

const app = express();

// TODO: add CORS
// TODO: add Rate Limiting

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, reader!");
});

app.get("/amazon/:bookTitle", async (req: Request, res: Response) => {
  res.json(await scrapeAmazon(req.params.bookTitle));
});

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;
