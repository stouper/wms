type PageProps = { params: { id: string } };

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = params;
  // TODO: 실제 API 연동
  const data = { id, name: '상품명(더미)', price: 49900, desc: '상품 상세 설명(더미)' };

  return (
    <div className="container grid">
      <div className="card">
        <div className="media" />
        <h2 style={{ marginTop: 14 }}>{data.name}</h2>
        <p style={{ margin: '6px 0 12px' }}>{data.price.toLocaleString()}원</p>
        <p>{data.desc}</p>
      </div>
    </div>
  );
}
