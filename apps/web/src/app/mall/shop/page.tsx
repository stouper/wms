type Product = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
};

export default async function ShopPage() {
  const res = await fetch('http://localhost:4000/api/products', {
    cache: 'no-store',
  });
  const data = await res.json();

  return (
    <div className="container">
      <h2>쇼핑</h2>

      <div className="grid" style={{ marginTop: 16 }}>
        {data.items.map((p: Product) => (
          <div key={p.id} className="card">
            {/* 상품 이미지 */}
            <div className="media" style={{ overflow: 'hidden' }}>
              <img
                src={p.imageUrl || '/placeholder.png'}
                alt={p.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 12,
                }}
              />
            </div>

            <h3 style={{ marginTop: 12 }}>{p.name}</h3>
            <p>{p.price.toLocaleString()}원</p>

            <a className="btn btn-primary" href={`/mall/product/${p.id}`}>
              상세보기
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
