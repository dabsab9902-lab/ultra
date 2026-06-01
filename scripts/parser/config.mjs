export const BASE_URL = "https://ultra-svet.com";

export const DEFAULT_LIMIT = 3000;
export const DEFAULT_DELAY = 350;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_RETRIES = 1;
export const DEFAULT_MAX_CATEGORY_PAGES = 5;

export const SEED_PAGES = [
  `${BASE_URL}/kabel-i-provod`,
  `${BASE_URL}/elektrofurnitura`,
  `${BASE_URL}/nizkovoltnoe-oborudovanie`,
  `${BASE_URL}/lampi`,
  `${BASE_URL}/svetilniki-dlya-doma`,
  `${BASE_URL}/vse-dlya-elektromontazha`,
  `${BASE_URL}/instrument`,
  `${BASE_URL}/`,
];

export const EXCLUDED_SLUGS = new Set([
  "pronas",
  "optovykam",
  "oplata-ua",
  "dostavka-ua",
  "ua-contact-us",
  "ua-compare-products",
  "ua-wishlist",
  "ua-account",
  "ua-login",
  "ua-register",
  "cart",
  "checkout",
  "search",
  "sitemap",
  "manufacturer",
  "postachalnykam",
  "kontakty-ua",
  "publichnaya-oferta",
  "umovy-obminu-ta-povernennya",
]);

export const CATEGORY_HINTS = [
  "kabel",
  "provod",
  "elektro",
  "nizkovolt",
  "lamp",
  "svet",
  "instrument",
  "montazh",
  "rozet",
  "avtomat",
  "oborudovanie",
  "rele",
  "kommutacion",
  "tehnika",
  "vykl",
  "vikl",
];

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
