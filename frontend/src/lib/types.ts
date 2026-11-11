export type User = { id: string; name: string; email: string; role: string };
export type Variant = {
  id: string;
  sku: string;
  priceMinor: number;
  compareAtMinor: number | null;
  stockQty: number;
  reservedQty: number;
  attrs: Record<string, string>;
};
export type Product = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  categoryId: string;
  status: string;
  featured: boolean;
  vendor: { id: string; storeName: string; slug: string };
  category: { id: string; name: string };
  variants: Variant[];
  reviews: { rating: number; body?: string; user?: { name: string }; createdAt?: string }[];
};
export type CartItem = {
  id: string;
  qty: number;
  variant: Variant & { product: Product & { vendorId: string } };
};
export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  city: string;
  postalCode: string;
};
export type OrderLine = {
  id: string;
  variantId: string;
  titleSnapshot: string;
  imageSnapshot: string;
  unitPriceMinor: number;
  qty: number;
};
export type VendorOrder = {
  id: string;
  orderId: string;
  status: string;
  goodsMinor: number;
  shippingMinor: number;
  vendorNetMinor: number;
  trackingNumber?: string;
  deliveredAt?: string;
  vendor: { storeName: string };
  lines: OrderLine[];
  returns: { id: string; status: string; reason: string }[];
  order?: { shippingAddress: Address; createdAt: string };
};
export type Order = {
  id: string;
  status: string;
  grandMinor: number;
  createdAt: string;
  shippingAddress: Address;
  payment: { provider: string; status: string; raw?: { redirectUrl?: string } };
  vendorOrders: VendorOrder[];
};
export type Category = { id: string; name: string; icon: string; _count: { products: number } };
export type CatalogResult = { items: Product[]; total: number; page: number; pages: number };
export const money = (minor: number) =>
  new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: minor % 100 ? 2 : 0,
  }).format(minor / 100);
export const pretty = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
