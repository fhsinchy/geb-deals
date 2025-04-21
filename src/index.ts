import express, { Request, Response } from "express";
import * as cheerio from "cheerio";
import axios from "axios";

interface AmazonProduct {
    image: string | undefined;
    title: string;
    price: string;
    link: string;
}

const app = express();

// TODO: add CORS
// TODO; add Rate Limiting

const scrapeAmazon = async (bookTitle: string) => {
    const amazonProducts: AmazonProduct[] = [];
    // k is the search query parameter.
    // i=digital-text ensures the search is scoped within Kindle ebooks only.
    // spaces in the search parameter should be replaced with the plus sign.

    const amazonUrl = `https://www.amazon.com/s?k=${bookTitle.toLowerCase().replaceAll(" ", "+")}&i=digital-text`

    const amazonResponse = await axios.get(amazonUrl, {headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36'}});
    
    const $ = cheerio.load(amazonResponse.data);

    const resultItems = $('div.s-result-item');

    resultItems.each((_, item) => {
        const book = $(item)

        const amazonProduct: AmazonProduct = {
            image: book.find('div.s-product-image-container > div > span > a > div > img.s-image').attr('src'),
            title: book.find('div.s-title-instructions-style > a > h2 > span').text(),
            price: `${book.find('span.a-price-symbol').text()}${book.find('span.a-price-whole').text()}${book.find('span.a-price-fraction').text()}`,
            link: `https://www.amazon.com${book.find('div.s-title-instructions-style > a').attr('href')}`
        }

        if (amazonProduct.image && amazonProduct.title && amazonProduct.price && amazonProduct.link ) {
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