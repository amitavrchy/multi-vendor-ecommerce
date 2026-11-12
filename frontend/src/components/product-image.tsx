'use client';
import { ImgHTMLAttributes } from 'react';
export function ProductImage({ onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      {...props}
      onError={(event) => {
        onError?.(event);
        if (!event.currentTarget.src.endsWith('/product-placeholder.svg')) {
          event.currentTarget.src = '/product-placeholder.svg';
          event.currentTarget.alt = props.alt
            ? `Image unavailable for ${props.alt}`
            : 'Product image unavailable';
        }
      }}
    />
  );
}
