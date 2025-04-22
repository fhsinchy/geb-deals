import express, { Request, Response, NextFunction } from "express";
import { scrapeAmazon } from "./vendor";
import { AmazonRouteParams } from "./vendor/amazon/types";

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware (Consider adding) ---
// TODO: import and use 'cors' middleware: app.use(cors());
// TODO: import and use rate limiting middleware like 'express-rate-limit'

// --- Routes ---

// Basic health check / root route
app.get("/", (req: Request, res: Response) => {
  res.status(200).send("Scraper API is running!");
});

app.get("/amazon/:bookTitle", async (req: Request<AmazonRouteParams>, res: Response, next: NextFunction) => {
  const { bookTitle } = req.params;

  if (!bookTitle || typeof bookTitle !== 'string' || bookTitle.trim() === '') {
     res.status(400).json({ error: "Missing or invalid 'bookTitle' parameter." });
     return; // Explicit return for clarity
  }

  try {
    console.log(`API received request to scrape for: ${bookTitle}`);

    const results = await scrapeAmazon(bookTitle);

    if (results.length === 0) {
        console.log(`Scraping for "${bookTitle}" yielded no results.`);
        res.status(404).json({ message: "No products found matching the title." });
    } else {
        console.log(`Successfully scraped ${results.length} items for "${bookTitle}".`);
        res.status(200).json(results);
    }

  } catch (error) {
    console.error(`Error in /amazon/:bookTitle route for "${bookTitle}":`, error);
    // Pass the error to the generic error handler
    next(error);
  }
});

// --- Generic Error Handling Middleware ---
// This should be defined LAST, after all other app.use() and routes
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Check if headers have already been sent (e.g., by the route handler)
  if (res.headersSent) {
    return next(err); // Delegate to default Express error handler
  }
  console.error("Unhandled error:", err.stack || err); // Log the full error stack
  // Avoid sending detailed error messages to the client in production
  res.status(500).json({ error: "Internal Server Error" });
});


// --- Server Start ---
app.listen(PORT, () => console.log(`Server ready on port ${PORT}.`));

// Export the app (useful for testing or serverless deployments)
// Use export default for ES Modules, or module.exports for CommonJS
export default app;
// If your tsconfig.json targets CommonJS, use:
// module.exports = app;
