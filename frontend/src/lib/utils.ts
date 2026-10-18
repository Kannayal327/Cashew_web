import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
export function weight(grams: number) {
  return grams === 1000 ? "1 kg" : `${grams} g`;
}
export const categories = [
  { slug: "all", name: "All cashews" },
  { slug: "whole-kernels", name: "Whole kernels" },
  { slug: "flavoured-snacks", name: "Flavoured snacks" },
  { slug: "culinary-pieces", name: "Culinary & pieces" },
  { slug: "cashew-butter", name: "Cashew butter" },
  { slug: "festive-hampers", name: "Festive hampers" },
];
