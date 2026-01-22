export const layoutStyle = {
  height: "100%",
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  overflow: "hidden",
  fontFamily: "Segoe UI, Roboto, sans-serif",
};

export const asideStyle = {
  borderRight: "1px solid #e5e7eb",
  padding: 12,
  background: "#fbfbfb",
  overflowY: "auto",
};

export const mainStyle = {
  padding: 20,
  overflow: "auto",
  minWidth: 0,
};

export const primaryBtn = {
  padding: "8px 10px",
  border: "1px solid #c7d2fe",
  borderRadius: 10,
  background: "#eef2ff",
  fontWeight: 800,
  cursor: "pointer",
};

export const inputStyle = {
  padding: "8px 10px",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
};

export const navBtnStyle = (active) => ({
  width: "100%",
  textAlign: "left",
  padding: "12px 12px",
  marginBottom: 6,
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: active ? "#eef2ff" : "#fff",
  fontWeight: active ? 700 : 500,
  fontSize: 15,
});
