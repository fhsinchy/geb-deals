import * as cheerio from "cheerio";
import axios, { AxiosRequestConfig, AxiosError } from "axios";
import { AmazonProduct } from "./types";

const scrapeAmazon = async (bookTitle: string): Promise<AmazonProduct[]> => {
  const amazonProducts: AmazonProduct[] = [];

  const baseUrl = "https://www.amazon.com";

  // Sanitize and format the search query
  const queryParameter = bookTitle.toLowerCase().replaceAll(" ", "+");

  // Configuration for the Axios request, including a User-Agent to mimic a browser
  const axiosReqConfig: AxiosRequestConfig = {
    baseURL: baseUrl,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9", // Added Accept-Language
      "Accept-Encoding": "gzip, deflate, br", // Added Accept-Encoding
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8", // Added Accept
      // Add other headers as needed to appear more like a real browser
    },
    timeout: 15000, // Add a timeout (e.g., 15 seconds)
  };

  let amazonResponse;
  try {
    console.log(`Attempting to fetch Amazon search results for: ${bookTitle}`);
    // Make the GET request to Amazon's search page for digital text (Kindle)
    amazonResponse = await axios.get(
      `/s?k=${queryParameter}&i=digital-text`,
      axiosReqConfig
    );

    // Optional: Check for non-2xx status codes if needed. Axios throws for >= 400 by default.
    if (amazonResponse.status < 200 || amazonResponse.status >= 300) {
      console.error(
        `Amazon request received non-success status: ${amazonResponse.status}`
      );
      // Return empty array as the request didn't succeed as expected
      return amazonProducts;
    }
    console.log(
      `Successfully fetched Amazon page. Status: ${amazonResponse.status}`
    );
  } catch (error) {
    // Handle potential errors during the network request
    if (axios.isAxiosError(error)) {
      // Specifically handle Axios errors (network, timeout, status code >= 400)
      const axiosError = error as AxiosError;
      console.error(
        `Axios error fetching Amazon page: ${axiosError.message}`,
        `Status: ${axiosError.response?.status}`,
        `URL: ${axiosError.config?.baseURL}${axiosError.config?.url}`
      );
    } else if (error instanceof Error) {
      // Handle generic JavaScript errors
      console.error(`Generic error fetching Amazon page: ${error.message}`);
    } else {
      // Handle other potential throwables
      console.error(`An unexpected error occurred during fetch: ${error}`);
    }
    // Return an empty array indicating failure to fetch data
    return amazonProducts;
  }

  try {
    // Load the HTML content into Cheerio for parsing
    const $ = cheerio.load(amazonResponse.data);

    // Select all search result items based on the data-component-type attribute
    const resultItems = $('div[data-component-type="s-search-result"]');
    console.log(`Found ${resultItems.length} potential result items.`);

    resultItems.each((index, item) => {
      try {
        const $book = $(item);

        // Initialize variables to store scraped data
        let title: string | null = null;
        let price: number | null = null;
        let coverImageUrl: string | null = null;
        let productLink: string | null = null;
        let isKindleUnlimited: boolean = false;
        let kindleUnlimitedPrice: number | null = null; // Price to buy if also KU

        // --- Extract Title ---
        title = $book.find("h2 a span").first().text().trim() || null; // Simplified selector, adjust if needed
        if (!title) {
          // Try another common selector if the first fails
          title =
            $book
              .find('div[data-cy="title-recipe"] > a > h2 > span')
              .text()
              .trim() || null;
        }
        if (!title) {
          console.warn(`Item ${index}: Could not extract title.`);
        }

        // TODO: price extraction needs more detailing
        const priceText = $book
          .find(
            'div[data-cy="price-recipe"] > div > div > a > span.a-price > span.a-offscreen'
          )
          .text()
          .trim();

        if (priceText == "$0.00") {
          const kuBadge = $book.find(
            'span.apex-kindle-program-badge img[alt="Kindle Unlimited"]'
          );
          const kuTextElement = $book.find(
            '.a-row.a-size-small.a-color-secondary:contains("Free with Kindle Unlimited membership")'
          );

          if (kuBadge.length > 0 || kuTextElement.length > 0) {
            isKindleUnlimited = true;
            price = 0.0; // KU price is effectively $0.00

            const secondaryPriceText = $book
              .find(
                'div[data-cy="secondary-offer-recipe"] .a-row.a-size-base.a-color-secondary'
              )
              .text()
              .trim();
            const match = secondaryPriceText.match(
              /Or \$([\d,]+\.\d{2}) to buy/
            );
            if (match && match[1]) {
              kindleUnlimitedPrice = parseFloat(match[1].replace(/,/g, ""));
            }
          } else {
            price = 0.0;
          }
        } else {
          // Regular price extraction
          try {
            price = parseFloat(priceText.replace(/[^0-9.]/g, ""));
            if (isNaN(price)) {
              price = null; // Set to null if parsing fails
            }
          } catch (e) {
            console.warn(`Could not parse price: ${priceText}`);
            price = null;
          }
        }

        // Fallback price check if the primary selector failed but KU secondary price exists
        if (
          price === null &&
          isKindleUnlimited &&
          kindleUnlimitedPrice !== null
        ) {
          // If it's KU and we found the 'to buy' price, but not the primary '$0.00',
          // assign the 'to buy' price as the main price and clear the secondary KU price.
          price = kindleUnlimitedPrice;
          isKindleUnlimited = false; // Reclassify as not KU if primary KU price wasn't found
          kindleUnlimitedPrice = null;
        } else if (price === null) {
          // Final check: Sometimes the price is directly in a-price-whole/fraction without offscreen
          const whole = $book
            .find("span.a-price-whole")
            .first()
            .text()
            .trim()
            .replace(".", "");
          const fraction = $book
            .find("span.a-price-fraction")
            .first()
            .text()
            .trim();
          if (whole && fraction) {
            try {
              price = parseFloat(`${whole}.${fraction}`);
              if (isNaN(price)) price = null;
            } catch (e) {
              console.warn(
                `Could not parse fallback price: ${whole}.${fraction}`
              );
              price = null;
            }
          }
        }

        coverImageUrl =
          $book
            .find('div[data-cy="image-container"] > div > span > a > div > img')
            .attr("src") || null;
        if (!coverImageUrl) {
          console.warn(`Item ${index}: Could not extract cover image URL.`);
        }

        // --- Extract Product Link ---
        let rawLink =
          $book.find("h2 a.a-link-normal").first().attr("href") || null; // More specific link selector within h2
        if (!rawLink) {
          // Fallback selector if the first fails
          rawLink =
            $book.find("a.a-link-normal.s-no-outline").first().attr("href") ||
            null;
        }

        if (rawLink) {
          // Construct absolute URL if necessary
          if (rawLink.startsWith("/")) {
            productLink = baseUrl + rawLink;
          } else if (rawLink.startsWith("http")) {
            productLink = rawLink;
          } else {
            console.warn(
              `Item ${index}: Encountered unexpected link format: ${rawLink}`
            );
            productLink = null; // Treat as invalid if format is unknown
          }

          // Clean the URL by removing tracking parameters
          if (productLink) {
            try {
              const url = new URL(productLink);
              // Remove common tracking/ref parameters - adjust list as needed
              const paramsToRemove = [
                "ref",
                "ref_",
                "dib",
                "dib_tag",
                "qid",
                "sr",
                "sprefix",
                "keywords",
                "s",
                "pd_rd_i",
                "pd_rd_w",
                "pd_rd_r",
                "pd_rd_wg",
                "pf_rd_p",
                "pf_rd_r",
                "creative",
                "creativeASIN",
                "linkCode",
                "tag",
                "linkId",
                "asc_content",
                "dchild",
                "keywords",
                "th",
                "psc",
              ];
              paramsToRemove.forEach((param) => url.searchParams.delete(param));
              productLink = url.pathname + url.search; // Keep path and remaining search params
              productLink = baseUrl + productLink; // Ensure it starts with base URL
            } catch (e) {
              console.warn(
                `Item ${index}: Could not parse or clean URL: ${productLink}`,
                e
              );
              // Keep the potentially unclean link if parsing/cleaning fails but format was okay
              productLink = rawLink.startsWith("/")
                ? baseUrl + rawLink
                : rawLink;
            }
          }
        } else {
          console.warn(`Item ${index}: Could not extract product link.`);
        }

        // --- Add to results if essential data is present ---
        if (title && productLink) {
          amazonProducts.push({
            bookTitle: title,
            bookPrice: price, // Can be null if not found/parsed
            coverImageUrl: coverImageUrl, // Can be null
            productLink: productLink,
            isKindleUnlimited: isKindleUnlimited,
            kindleUnlimitedPrice: kindleUnlimitedPrice, // Price to buy if KU, otherwise null
          });
        } else {
          console.warn(
            `Item ${index}: Skipping item due to missing title or product link.`
          );
        }
      } catch (itemError) {
        // Catch errors specific to processing a single item
        if (itemError instanceof Error) {
          console.error(
            `Error processing item ${index}: ${itemError.message}`,
            itemError.stack
          );
        } else {
          console.error(
            `An unexpected error occurred processing item ${index}: ${itemError}`
          );
        }
        // Continue to the next item even if one fails
      }
    });
  } catch (scrapingError) {
    // Catch errors related to Cheerio loading or top-level selection
    if (scrapingError instanceof Error) {
      console.error(
        `Error during HTML parsing or scraping setup: ${scrapingError.message}`,
        scrapingError.stack
      );
    } else {
      console.error(
        `An unexpected error occurred during scraping setup: ${scrapingError}`
      );
    }
    // Depending on requirements, you might return partially scraped data
    // or just the empty array indicating a larger failure.
    // return amazonProducts; // Option to return partial data
  }

  console.log(
    `Scraping finished. Found ${amazonProducts.length} valid products.`
  );
  // Return the array of successfully scraped products
  return amazonProducts;
};

export default scrapeAmazon;
