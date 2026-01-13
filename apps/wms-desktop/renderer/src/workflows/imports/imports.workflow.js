// renderer/src/workflows/imports/imports.workflow.js
import { importsApi } from "./imports.api";

export const importsFlow = {
  uploadHqInventory: async ({ file }) => {
    if (!file) throw new Error("업로드할 HQ 재고 엑셀을 선택해줘.");
    // 응답 바디는 굳이 안 써도 되지만, 실패/성공은 http에서 보장
    await importsApi.uploadHqInventory(file);
    return true;
  },
};
