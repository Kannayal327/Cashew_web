export interface ProductVariant {
  id: string;
  sku: string;
  weight_grams: number;
  price_paise: number;
  available_stock: number;
}
export interface Product {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  category: string;
  grade: string | null;
  image: string;
  accent: string;
  ingredients: string;
  variants: ProductVariant[];
}
export interface CartLine {
  variant_id: string;
  product_slug: string;
  product_name: string;
  accent: string;
  weight_grams: number;
  price_paise: number;
  available_stock: number;
  quantity: number;
}
export interface Quote {
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  total_paise: number;
  coupon: string | null;
  currency: string;
  free_shipping_threshold_paise: number;
  delivery_estimate: string;
}
export interface CreatedOrder extends Quote {
  id: string;
  reference: string;
  razorpay_order_id: string | null;
  razorpay_key_id: string | null;
  payment_provider: string;
  payment_status: "PENDING" | "PAID" | "EXPIRED" | "REVIEW";
  order_token: string;
  reservation_expires_at: string;
}
export interface TrackingOrder {
  id: string;
  reference: string;
  status: "PLACED" | "PACKED" | "SHIPPED" | "DELIVERED";
  payment_status: string;
  created_at: string;
  total_paise: number;
  carrier: string | null;
  tracking_number: string | null;
  items: {
    product_name: string;
    product_slug: string;
    weight_grams: number;
    quantity: number;
  }[];
  events: { message: string; created_at: string }[];
}
