export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} ${res.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function apiPostForm<T = any>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST(form) ${path} ${res.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function apiPostJson<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "include",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST(json) ${path} ${res.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function apiPatchJson<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
    credentials: "include",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PATCH ${path} ${res.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DELETE ${path} ${res.status} ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}
