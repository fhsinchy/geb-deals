import express, { Request, Response } from "express";
import * as cheerio from "cheerio";
import axios from "axios";
import fs from "fs";

interface AmazonProduct {
    image: string | undefined;
    title: string;
    price: number;
    link: string;
}

const app = express();

// TODO: add CORS
// TODO; add Rate Limiting

const scrapeAmazon = async (bookTitle: string) => {
    const amazonProducts: AmazonProduct[] = [];
    const amazonBaseUrl = 'https://www.amazon.com';
    const queryParameter = bookTitle.toLowerCase().replaceAll(" ", "+")
    const windowsUserAgentString = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36'
   
    // k is the search query parameter.
    // i=digital-text ensures the search is scoped within Kindle ebooks only.
    // spaces in the search parameter should be replaced with the plus sign.

    const amazonUrl = `${amazonBaseUrl}/s?k=${queryParameter}&i=digital-text`

    const amazonResponse = await axios.get(amazonUrl, {headers: {'User-Agent': windowsUserAgentString}});
    
    const $ = cheerio.load(amazonResponse.data);

    const resultItems = $('div[data-component-type="s-search-result"]');

    resultItems.each((_, item) => {
        const $book = $(item)

        const title = $book.find('div[data-cy="title-recipe"] > a > h2 > span').text().trim();
        const imageUrl = $book.find('div[data-cy="image-container"] > div > span > a > div > img').attr('src');
        const productUrl = `${amazonBaseUrl}${$book.find('div[data-cy="title-recipe"] > a').attr('href')}`
        let isKindleUnlimited = false;
        let kindleUnlimitedPrice: number | null = null;
        let price: number | null;
        const priceText = $book.find('div[data-cy="price-recipe"] > div > div > a > span.a-price > span.a-offscreen').text().trim();

        if (priceText == "$0.00") {
            const kuBadge = $book.find('span.apex-kindle-program-badge img[alt="Kindle Unlimited"]');
            const kuTextElement = $book.find('.a-row.a-size-small.a-color-secondary:contains("Free with Kindle Unlimited membership")');

            if (kuBadge.length > 0 || kuTextElement.length > 0) {
                isKindleUnlimited = true;
                price = 0.00; // KU price is effectively $0.00

                const secondaryPriceText = $book.find('div[data-cy="secondary-offer-recipe"] .a-row.a-size-base.a-color-secondary').text().trim();
                const match = secondaryPriceText.match(/Or \$([\d,]+\.\d{2}) to buy/);
              if (match && match[1]) {
                kindleUnlimitedPrice = parseFloat(match[1].replace(/,/g, ''));
              }
            } else {
                price = 0.00;
            }
        } else {
            // Regular price extraction
             try {
                price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                if (isNaN(price)) {
                     price = null; // Set to null if parsing fails
                }
             } catch (e) {
                 console.warn(`Could not parse price: ${priceText}`);
                 price = null;
             }
          }

        // Fallback price check if the primary selector failed but KU secondary price exists
     if (price === null && isKindleUnlimited && kindleUnlimitedPrice !== null) {
        // If it's KU and we found the 'to buy' price, but not the primary '$0.00',
        // assign the 'to buy' price as the main price and clear the secondary KU price.
        price = kindleUnlimitedPrice;
        isKindleUnlimited = false; // Reclassify as not KU if primary KU price wasn't found
        kindleUnlimitedPrice = null;
    } else if (price === null) {
       // Final check: Sometimes the price is directly in a-price-whole/fraction without offscreen
       const whole = $book.find('span.a-price-whole').first().text().trim().replace('.', '');
       const fraction = $book.find('span.a-price-fraction').first().text().trim();
        if (whole && fraction) {
           try {
                price = parseFloat(`${whole}.${fraction}`);
                if (isNaN(price)) price = null;
            } catch(e){
                console.warn(`Could not parse fallback price: ${whole}.${fraction}`);
                price = null;
            }
        }
    }

        // $item.find('div[data-cy="secondary-offer-recipe"] .a-row.a-size-base.a-color-secondary').text().trim();
        const amazonProduct: AmazonProduct = {
            image: imageUrl,
            title: title,
            price: 0,
            link: productUrl
        }

        if (amazonProduct.title) {
            if (amazonProduct.price == 0) {
                console.log('ku product')
                console.log($book.find('data-cy=secondary-offer-recipe').length)
            }
            amazonProducts.push(amazonProduct);
        }
        
    });

    return amazonProducts;
}

app.get("/", async (req: Request, res: Response) => {
    res.json(await scrapeAmazon("Notes from The Underground"));
    
})

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;