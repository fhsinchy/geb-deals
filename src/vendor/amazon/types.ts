interface AmazonProduct {
  bookTitle: string | null;
  bookPrice: number | null;
  coverImageUrl: string | null;
  productLink: string | null;
  isKindleUnlimited: boolean | null;
  kindleUnlimitedPrice: number | null;
}

export default AmazonProduct;