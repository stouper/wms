// renderer/src/workflows/imports/imports.api.js
import { http } from "../_common/http";

export const importsApi = {
  uploadHqInventory: async (file) => {
    if (!file) throw new Error("file is required");

    const form = new FormData();
    form.append("file", file);

    // http가 FormData면 Content-Type 자동설정 안 함 (브라우저가 boundary 붙임)
    return http.post(`/imports/hq-inventory`, form);
  },
};
