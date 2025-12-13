import Link from 'next/link';

type Product = { id: string; name: string; price: number };
const dummy: Product[] = [
  { id: 'p-1001', name: '클래식 클로그', price: 49900 },
  { id: 'p-1002', name: '라이트라이드 샌들', price: 69000 },
  { id: 'p-1003', name: '크록밴드 클로그', price: 55900 },
  { id: 'p-1004', name: '바야밴드 샌들', price: 48900 },
  { id: 'p-1005', name: '카디겐 라이너', price: 39000 },
  { id: 'p-1006', name: '지빗 세트', price: 15000 },
];

export default function ShopPage() {
  return (
    <div className="container">
      <h2>쇼핑</h2>
      <div className="grid" style={{ marginTop: 14 }}>
        {dummy.map((p) => (
          <div key={p.id} className="card">
            <div className="media" />
            <h3 style={{ marginTop: 12 }}>{p.name}</h3>
            <p style={{ margin: '6px 0 12px' }}>{p.price.toLocaleString()}원</p>
            <Link className="btn btn-primary" href={`/mall/product/${p.id}`}>자세히 보기</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
