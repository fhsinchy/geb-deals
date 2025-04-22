import { ParamsDictionary } from "express-serve-static-core";

interface AmazonRouteParams extends ParamsDictionary {
  bookTitle: string;
}

interface AmazonProduct {
  bookTitle: string | null;
  bookPrice: number | null;
  coverImageUrl: string | null;
  productLink: string | null;
  isKindleUnlimited: boolean | null;
  kindleUnlimitedPrice: number | null;
}

export {
  AmazonProduct,
  AmazonRouteParams,
};