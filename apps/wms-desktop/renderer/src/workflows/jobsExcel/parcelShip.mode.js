export const parcelShipMode = {
  key: "parcelShip",
  title: "택배 요청",
  sheetName: "WORK",

  validateUpload() {
    return { ok: true };
  },

  async createJobsFromPreview() {
    // 지금은 택배는 "미리보기까지만" 남기기로 했으니까 생성 막아둠
    throw new Error("택배 요청은 아직 Job 생성 단계가 아냐. (미리보기까지만)");
  },

  async scan() {
    return { ok: false, error: "택배 요청 화면에서는 스캔 기능을 아직 안 써. (미리보기까지만)" };
  },
};
