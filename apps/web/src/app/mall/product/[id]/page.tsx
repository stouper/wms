type PageContext = {
  params: Promise<{ id: string }>;
};

type Product = {
  id: string;
  name: string;
  price: number;
  desc?: string;
  imageUrl?: string;
};

export default async function ProductDetailPage(ctx: PageContext) {
  // ✅ Next 15: params는 비동기 → await 필수
  const { id } = await ctx.params;

  const res = await fetch(`http://localhost:4000/api/products/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    return (
      <div className="container">
        <h2>상품을 찾을 수 없습니다.</h2>
      </div>
    );
  }

  const { item }: { item: Product } = await res.json();

  return (
    <div className="container">
      <div className="card">
        <div className="media" style={{ overflow: 'hidden' }}>
          <img
            src={item.imageUrl || '/placeholder.png'}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }}
          />
        </div>

        <h2 style={{ marginTop: 16 }}>{item.name}</h2>
        <p>{item.price.toLocaleString()}원</p>
        {item.desc && <p style={{ marginTop: 8 }}>{item.desc}</p>}
      </div>
    </div>
  );
}
