export type Product = {
  id: string;
  name: string;
  price: number;
  desc?: string;
  imageUrl?: string; // ✅ 추가
};

export const products: Product[] = [
  {
    id: 'p-1001',
    name: '클래식 클로그',
    price: 49900,
    desc: '크록스 베스트셀러',
    imageUrl: '/uploads/sample1.jpg',
  },
];
