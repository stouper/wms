// renderer/src/workflows/_common/operator.js

const OPERATOR_KEY = "wms_operator_id";

/**
 * localStorage에서 작업자 ID를 가져온다
 * @returns {string | null}
 */
export function getOperatorId() {
  try {
    return localStorage.getItem(OPERATOR_KEY);
  } catch (e) {
    console.error("getOperatorId error:", e);
    return null;
  }
}

/**
 * localStorage에 작업자 ID를 저장한다
 * @param {string} operatorId
 */
export function setOperatorId(operatorId) {
  try {
    if (!operatorId || String(operatorId).trim() === "") {
      localStorage.removeItem(OPERATOR_KEY);
    } else {
      localStorage.setItem(OPERATOR_KEY, String(operatorId).trim());
    }
  } catch (e) {
    console.error("setOperatorId error:", e);
  }
}

/**
 * localStorage에서 작업자 ID를 삭제한다
 */
export function clearOperatorId() {
  try {
    localStorage.removeItem(OPERATOR_KEY);
  } catch (e) {
    console.error("clearOperatorId error:", e);
  }
}
