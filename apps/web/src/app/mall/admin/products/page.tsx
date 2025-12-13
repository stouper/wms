'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Product = { id: string; name: string; price: number; desc?: string; imageUrl?: string };

export default function AdminProductsPage() {
  // 목록 상태
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // 등록 폼 상태
  const [name, setName] = useState('');
  const [price, setPrice] = useState<string>('');
  const [desc, setDesc] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);

  const canCreate = useMemo(
    () => name.trim().length > 0 && /^\d+$/.test(price) && !uploading,
    [name, price, uploading],
  );

  async function load() {
    setLoading(true);
    const res = await fetch('/api/products', { cache: 'no-store', credentials: 'same-origin' });
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onUploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/uploads', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(`이미지 업로드 실패: ${data.error || res.status}`);
        return;
      }
      setImageUrl(data.url as string);
    } finally {
      setUploading(false);
    }
  }

  async function onCreate() {
    if (!canCreate) {
      alert('이름/가격/업로드 상태를 확인하세요.');
      return;
    }
    try {
      setCreating(true);
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name,
          price: Number(price),
          desc,
          imageUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(`등록 실패: ${data.error || res.status}`);
        return;
      }
      // 폼 리셋
      setName('');
      setPrice('');
      setDesc('');
      setImageUrl(undefined);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('정말 삭제할까요?')) return;
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      alert(`삭제 실패: ${data.error || res.status}`);
      return;
    }
    await load();
  }

  async function onEdit(p: Product) {
    const newName = prompt('상품명', p.name);
    if (newName === null) return;
    const newPriceStr = prompt('가격(숫자)', String(p.price));
    if (newPriceStr === null || !/^\d+$/.test(newPriceStr)) {
      alert('가격이 올바르지 않습니다.');
      return;
    }
    const newDesc = prompt('설명', p.desc || '') ?? p.desc;

    const res = await fetch(`/api/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: newName,
        price: Number(newPriceStr),
        desc: newDesc,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      alert(`수정 실패: ${data.error || res.status}`);
      return;
    }
    await load();
  }

  return (
    <div className="container">
      <h2>상품 관리</h2>

      {/* 등록 폼 */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>신규 등록</h3>

        {/* 이미지 업로드 & 미리보기 */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadFile(file);
              }}
            />
            {uploading && <span>업로드 중...</span>}
            {imageUrl && (
              <img
                src={imageUrl}
                alt="preview"
                style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }}
              />
            )}
          </div>

          <input
            placeholder="상품명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'inherit',
            }}
          />
          <input
            placeholder="가격 (숫자)"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'inherit',
            }}
          />
          <textarea
            placeholder="설명 (선택)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'inherit',
              resize: 'vertical',
            }}
          />
          <div>
            <button className="btn btn-primary" disabled={!canCreate || creating} onClick={onCreate}>
              {creating ? '등록 중...' : '등록'}
            </button>
          </div>
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <p style={{ marginTop: 12 }}>불러오는 중...</p>
      ) : (
        <div className="grid" style={{ marginTop: 12 }}>
          {items.map((p) => (
            <div key={p.id} className="card">
              <div className="media" style={{ overflow: 'hidden' }}>
                <img
                  src={p.imageUrl || '/placeholder.png'}
                  alt={p.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <h3 style={{ marginTop: 12 }}>{p.name}</h3>
              <p style={{ margin: '6px 0 12px' }}>{p.price.toLocaleString()}원</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link className="btn btn-primary" href={`/mall/product/${p.id}`}>
                  상세
                </Link>
                <button className="btn" onClick={() => onEdit(p)}>
                  수정
                </button>
                <button className="btn" onClick={() => onDelete(p.id)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
