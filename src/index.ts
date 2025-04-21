import express, { raw, Request, Response } from "express";
import * as cheerio from "cheerio";
import axios, { AxiosRequestConfig } from "axios";

interface AmazonProduct {
  bookTitle: string | null;
  bookPrice: number | null;
  coverImageUrl: string | null;
  productLink: string | null;
  isKindleUnlimited: boolean | null;
  kindleUnlimitedPrice: number | null;
}

const app = express();

// TODO: add CORS
// TODO: add Rate Limiting

const scrapeAmazon = async (bookTitle: string) => {
  const amazonProducts: AmazonProduct[] = [];

  const baseUrl = "https://www.amazon.com";
  const queryParameter = bookTitle.toLowerCase().replaceAll(" ", "+");

  const axiosReqConfig: AxiosRequestConfig = {
    baseURL: baseUrl,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36",
    },
  };

  const amazonResponse = await axios.get(
    `/s?k=${queryParameter}&i=digital-text`,
    axiosReqConfig
  );

  const $ = cheerio.load(amazonResponse.data);

  const resultItems = $('div[data-component-type="s-search-result"]');

  resultItems.each((_, item) => {
    const $book = $(item);

    let bookTitle: string | null = null;
    let bookPrice: number | null = null;
    let coverImageUrl: string | null = null;
    let productLink: string | null = null;
    let isKindleUnlimited: boolean = false;
    let kindleUnlimitedPrice: number | null = null;

    bookTitle =
      $book.find('div[data-cy="title-recipe"] > a > h2 > span').text().trim() ||
      null;

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
        bookPrice = 0.0; // KU price is effectively $0.00

        const secondaryPriceText = $book
          .find(
            'div[data-cy="secondary-offer-recipe"] .a-row.a-size-base.a-color-secondary'
          )
          .text()
          .trim();
        const match = secondaryPriceText.match(/Or \$([\d,]+\.\d{2}) to buy/);
        if (match && match[1]) {
          kindleUnlimitedPrice = parseFloat(match[1].replace(/,/g, ""));
        }
      } else {
        bookPrice = 0.0;
      }
    } else {
      // Regular price extraction
      try {
        bookPrice = parseFloat(priceText.replace(/[^0-9.]/g, ""));
        if (isNaN(bookPrice)) {
          bookPrice = null; // Set to null if parsing fails
        }
      } catch (e) {
        console.warn(`Could not parse price: ${priceText}`);
        bookPrice = null;
      }
    }

    // Fallback price check if the primary selector failed but KU secondary price exists
    if (
      bookPrice === null &&
      isKindleUnlimited &&
      kindleUnlimitedPrice !== null
    ) {
      // If it's KU and we found the 'to buy' price, but not the primary '$0.00',
      // assign the 'to buy' price as the main price and clear the secondary KU price.
      bookPrice = kindleUnlimitedPrice;
      isKindleUnlimited = false; // Reclassify as not KU if primary KU price wasn't found
      kindleUnlimitedPrice = null;
    } else if (bookPrice === null) {
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
          bookPrice = parseFloat(`${whole}.${fraction}`);
          if (isNaN(bookPrice)) bookPrice = null;
        } catch (e) {
          console.warn(`Could not parse fallback price: ${whole}.${fraction}`);
          bookPrice = null;
        }
      }
    }

    coverImageUrl =
      $book
        .find('div[data-cy="image-container"] > div > span > a > div > img')
        .attr("src") || null;

    let rawLink =
      $book.find('div[data-cy="title-recipe"] > a').attr("href") || null;

    if (rawLink) {
      if (rawLink.startsWith("/")) {
        productLink = baseUrl + rawLink;
      } else if (rawLink.startsWith("http")) {
        productLink = rawLink;
      }

      if (productLink) {
        try {
          const url = new URL(productLink);
          // Remove common tracking/ref parameters - adjust as needed
          url.searchParams.delete("ref");
          url.searchParams.delete("ref_");
          url.searchParams.delete("dib");
          url.searchParams.delete("dib_tag");
          url.searchParams.delete("qid");
          url.searchParams.delete("sr");
          url.searchParams.delete("sprefix");
          url.searchParams.delete("keywords");
          url.searchParams.delete("s");
          url.searchParams.delete("pd_rd_i");
          url.searchParams.delete("pd_rd_w");
          url.searchParams.delete("pd_rd_r");
          url.searchParams.delete("pd_rd_wg");
          url.searchParams.delete("pf_rd_p");
          url.searchParams.delete("pf_rd_r");

          productLink = url.toString();
        } catch (e) {
          console.warn(`Could not parse URL: ${productLink}`);
          // Keep the raw link if parsing fails
          productLink = rawLink.startsWith("/") ? baseUrl + rawLink : rawLink;
        }
      }
    }

    if (bookTitle && productLink) {
      amazonProducts.push({
        bookTitle,
        bookPrice,
        coverImageUrl,
        productLink,
        isKindleUnlimited,
        kindleUnlimitedPrice,
      });
    }
  });

  return amazonProducts;
};

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, reader!");
});

app.get("/amazon/:bookTitle", async (req: Request, res: Response) => {
  res.json(await scrapeAmazon(req.params.bookTitle));
});

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;
