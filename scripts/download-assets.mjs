import { mkdir, writeFile } from 'node:fs/promises';
const photos = [
  '1567538096630-e0c55bd6374c',
  '1546435770-a3e426bf472b',
  '1553062407-98eeb64c6a62',
  '1514228742587-6b1558fcca3d',
  '1524805444758-089113d48a6d',
  '1608571423902-eed4a5ad8108',
  '1507473885765-e6ed057f782c',
  '1608043152269-423dbba4e7e1',
  '1598033129183-c4f50c736f10',
  '1495474472287-4d71bcdd2085',
  '1499933374294-4584851497cc',
  '1587829741301-dc798b83add3',
  '1549298916-b41d501d3772',
  '1602874801006-e26c72c2b5e9',
  '1553062407-98eeb64c6a62',
  '1556229010-6c3f2c9ca5f8',
  '1584100936595-c0654b55a2e2',
  '1606220945770-b5b6c2c55bf1',
  '1521572163474-6864f9cf17ab',
  '1602143407151-7111542de6e8',
  '1600210492486-724fe5c67fb0',
  '1527814050087-3793815479db',
  '1511499767150-a48a237f0083',
  '1608571423902-eed4a5ad8108',
  '1490312278390-ab64016e0aa9',
  '1527443224154-c4a3942d3acf',
  '1627123424574-724758594e93',
  '1544816155-12df9643f363',
  '1600369671236-e74521d4b6ad',
  '1507473885765-e6ed057f782c',
];
await mkdir('frontend/public/products', { recursive: true });
for (let i = 0; i < photos.length; i++) {
  let res = await fetch(
    `https://images.unsplash.com/photo-${photos[i]}?auto=format&fit=crop&w=800&q=85`,
  );
  if (!res.ok) {
    console.warn(`Photo ${i + 1} unavailable, using fallback`);
    res = await fetch(
      'https://images.unsplash.com/photo-1499933374294-4584851497cc?auto=format&fit=crop&w=800&q=85',
    );
  }
  if (!res.ok) throw new Error('Asset download failed');
  await writeFile(
    `frontend/public/products/${String(i + 1).padStart(2, '0')}.jpg`,
    Buffer.from(await res.arrayBuffer()),
  );
}
const hero = await fetch(
  'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=90',
);
if (!hero.ok) throw new Error('Hero download failed');
await writeFile('frontend/public/products/hero.jpg', Buffer.from(await hero.arrayBuffer()));
console.log('Downloaded 31 photographs. See ASSETS.md for credits.');
