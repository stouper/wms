// lib/authApi.ts - core-api 인증 API 호출
import { auth } from '../firebaseConfig';

// API Base URL (운영 서버 고정)
const API_BASE_URL = 'https://backend.dheska.com';

export interface EmployeeInfo {
  id: string;
  firebaseUid: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'ADMIN' | 'STAFF';
  status: 'ACTIVE' | 'PENDING' | 'DISABLED';
  isHq: boolean;
  storeId: string | null;
  storeCode: string | null;
  storeName: string | null;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
}

export interface AuthResult {
  success: boolean;
  employee?: EmployeeInfo;
  error?: string;
}

// Firebase idToken으로 core-api 인증
export async function authenticateWithCoreApi(): Promise<AuthResult> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    // Firebase idToken 획득
    const idToken = await user.getIdToken();

    // core-api 호출
    const response = await fetch(`${API_BASE_URL}/auth/firebase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('authenticateWithCoreApi error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 푸시 토큰 업데이트
export async function updatePushToken(pushToken: string): Promise<boolean> {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const response = await fetch(`${API_BASE_URL}/auth/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firebaseUid: user.uid,
        pushToken,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('updatePushToken error:', error);
    return false;
  }
}

// 관리자용: 직원 목록 조회
export async function getEmployees(status?: string): Promise<EmployeeInfo[]> {
  try {
    const url = status
      ? `${API_BASE_URL}/auth/employees?status=${status}`
      : `${API_BASE_URL}/auth/employees`;

    const response = await fetch(url);
    if (!response.ok) return [];

    return await response.json();
  } catch (error) {
    console.error('getEmployees error:', error);
    return [];
  }
}

// 관리자용: 직원 승인
export async function approveEmployee(
  employeeId: string,
  role?: string,
  storeId?: string,
  departmentId?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/employees/${employeeId}/approve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role, storeId, departmentId }),
    });

    return response.ok;
  } catch (error) {
    console.error('approveEmployee error:', error);
    return false;
  }
}

// 관리자용: 직원 거부
export async function rejectEmployee(employeeId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/employees/${employeeId}/reject`, {
      method: 'PATCH',
    });

    return response.ok;
  } catch (error) {
    console.error('rejectEmployee error:', error);
    return false;
  }
}

// Store 정보 타입
export interface StoreInfo {
  id: string;
  code: string;
  name: string | null;
  isHq: boolean;
  employeeCount?: number;
}

// 매장 목록 조회 (승인 시 선택용)
export async function getStores(): Promise<StoreInfo[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/stores`);
    if (!response.ok) return [];

    const data = await response.json();
    return data.rows || [];
  } catch (error) {
    console.error('getStores error:', error);
    return [];
  }
}

// 매장 생성
export async function createStore(
  code: string,
  name?: string,
  isHq?: boolean
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, isHq }),
    });
    const data = await response.json();
    if (response.ok) {
      return { success: true, id: data.id };
    }
    return { success: false, error: data.error || 'Failed to create store' };
  } catch (error: any) {
    console.error('createStore error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 매장 수정
export async function updateStore(
  id: string,
  data: { code?: string; name?: string; isHq?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/stores/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      return { success: true };
    }
    const respData = await response.json();
    return { success: false, error: respData.error || 'Failed to update store' };
  } catch (error: any) {
    console.error('updateStore error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 매장 삭제
export async function deleteStore(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/stores/${id}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      return { success: true };
    }
    return { success: false, error: 'Failed to delete store' };
  } catch (error: any) {
    console.error('deleteStore error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// Department 정보 타입
export interface DepartmentInfo {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  employeeCount?: number;
}

// 부서 목록 조회
export async function getDepartments(activeOnly = false): Promise<DepartmentInfo[]> {
  try {
    const url = activeOnly
      ? `${API_BASE_URL}/departments?activeOnly=true`
      : `${API_BASE_URL}/departments`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return data.rows || [];
  } catch (error) {
    console.error('getDepartments error:', error);
    return [];
  }
}

// 부서 생성
export async function createDepartment(code: string, name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
    });
    return await response.json();
  } catch (error: any) {
    console.error('createDepartment error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 부서 수정
export async function updateDepartment(
  id: string,
  data: { code?: string; name?: string; isActive?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/departments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await response.json();
  } catch (error: any) {
    console.error('updateDepartment error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 부서 삭제
export async function deleteDepartment(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/departments/${id}`, {
      method: 'DELETE',
    });
    return await response.json();
  } catch (error: any) {
    console.error('deleteDepartment error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 관리자용: 직원 정보 수정
export async function updateEmployee(
  employeeId: string,
  data: { name?: string; phone?: string; role?: string; storeId?: string }
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/employees/${employeeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    return response.ok;
  } catch (error) {
    console.error('updateEmployee error:', error);
    return false;
  }
}

// 관리자용: 직원 삭제
export async function deleteEmployee(employeeId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/employees/${employeeId}`, {
      method: 'DELETE',
    });

    return response.ok;
  } catch (error) {
    console.error('deleteEmployee error:', error);
    return false;
  }
}

// 부서별 직원 목록 조회
export async function getEmployeesByDepartmentId(departmentId: string): Promise<EmployeeInfo[]> {
  try {
    const employees = await getEmployees('ACTIVE');
    return employees.filter((e) => e.departmentId === departmentId);
  } catch (error) {
    console.error('getEmployeesByDepartmentId error:', error);
    return [];
  }
}

// 매장별 직원 목록 조회
export async function getEmployeesByStoreId(storeId: string): Promise<EmployeeInfo[]> {
  try {
    const employees = await getEmployees('ACTIVE');
    return employees.filter((e) => e.storeId === storeId);
  } catch (error) {
    console.error('getEmployeesByStoreId error:', error);
    return [];
  }
}

// 회원가입 (Employee 생성)
export interface RegisterEmployeeData {
  firebaseUid: string;
  name: string;
  email: string;
  phone: string;
  isHq: boolean;
}

export async function registerEmployee(data: RegisterEmployeeData): Promise<AuthResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error || `HTTP ${response.status}` };
    }

    return await response.json();
  } catch (error: any) {
    console.error('registerEmployee error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// ==========================================
// 달력 이벤트 API (PostgreSQL)
// ==========================================

export interface EventInfo {
  id: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// 이벤트 목록 조회 (날짜 범위)
export async function getEvents(startDate: string, endDate: string): Promise<EventInfo[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/events?startDate=${startDate}&endDate=${endDate}`
    );
    if (!response.ok) return [];

    const data = await response.json();
    return data.rows || [];
  } catch (error) {
    console.error('getEvents error:', error);
    return [];
  }
}

// 이벤트 생성
export async function createEvent(data: {
  title: string;
  description?: string;
  date: string;
}): Promise<{ success: boolean; event?: EventInfo; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        title: data.title,
        description: data.description,
        date: data.date,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('createEvent error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 이벤트 수정
export async function updateEvent(
  id: string,
  data: { title?: string; description?: string; date?: string }
): Promise<{ success: boolean; event?: EventInfo; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        ...data,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('updateEvent error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 이벤트 삭제
export async function deleteEvent(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/events/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('deleteEvent error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// ==========================================
// 게시판 API (PostgreSQL)
// ==========================================

export interface FileAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface BoardPostInfo {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  images: string[] | null;
  files: FileAttachment[] | null;
  createdAt: string;
  updatedAt: string;
}

// 게시글 목록 조회
export async function getBoardPosts(
  limit = 50,
  offset = 0
): Promise<{ rows: BoardPostInfo[]; total: number }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/board-posts?limit=${limit}&offset=${offset}`
    );
    if (!response.ok) return { rows: [], total: 0 };

    return await response.json();
  } catch (error) {
    console.error('getBoardPosts error:', error);
    return { rows: [], total: 0 };
  }
}

// 게시글 단건 조회
export async function getBoardPost(id: string): Promise<BoardPostInfo | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/board-posts/${id}`);
    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.error('getBoardPost error:', error);
    return null;
  }
}

// 게시글 생성
export async function createBoardPost(data: {
  title: string;
  content: string;
  images?: string[];
  files?: FileAttachment[];
}): Promise<{ success: boolean; post?: BoardPostInfo; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/board-posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        title: data.title,
        content: data.content,
        images: data.images,
        files: data.files,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('createBoardPost error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 게시글 수정
export async function updateBoardPost(
  id: string,
  data: {
    title?: string;
    content?: string;
    images?: string[];
    files?: FileAttachment[];
  }
): Promise<{ success: boolean; post?: BoardPostInfo; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/board-posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        ...data,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('updateBoardPost error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 게시글 삭제
export async function deleteBoardPost(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/board-posts/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('deleteBoardPost error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// ==========================================
// 공지 메시지 API (PostgreSQL)
// ==========================================

export type MessageTargetType = 'ALL' | 'STORE' | 'HQ_DEPT';

export interface ReceiptInfo {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string | null;
  storeName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  readAt?: string;
  pushToken?: string;
  status?: string;
  role?: string;
}

export interface MessageInfo {
  id: string;
  title: string;
  body: string;
  targetType: MessageTargetType;
  targetStoreIds: string[] | null;
  targetDeptCodes: string[] | null;
  authorId: string;
  authorName: string;
  receiptCount?: number;
  createdAt: string;
  updatedAt: string;
  reads?: ReceiptInfo[];
  unreads?: ReceiptInfo[];
}

// 메시지 목록 조회 (관리자용)
export async function getMessages(
  limit = 50,
  offset = 0
): Promise<{ rows: MessageInfo[]; total: number }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/messages?limit=${limit}&offset=${offset}`
    );
    if (!response.ok) return { rows: [], total: 0 };

    return await response.json();
  } catch (error) {
    console.error('getMessages error:', error);
    return { rows: [], total: 0 };
  }
}

// 메시지 단건 조회 (상세 - receipts 포함)
export async function getMessage(id: string): Promise<MessageInfo | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/messages/${id}`);
    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.error('getMessage error:', error);
    return null;
  }
}

// 메시지 생성 (+ 푸시 토큰 반환)
export async function createMessage(data: {
  title: string;
  body: string;
  targetType: MessageTargetType;
  targetStoreIds?: string[];
  targetDeptCodes?: string[];
}): Promise<{
  success: boolean;
  message?: MessageInfo;
  targetCount?: number;
  pushTokens?: string[];
  error?: string;
}> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        title: data.title,
        body: data.body,
        targetType: data.targetType,
        targetStoreIds: data.targetStoreIds,
        targetDeptCodes: data.targetDeptCodes,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('createMessage error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 메시지 수정
export async function updateMessage(
  id: string,
  data: { title?: string; body?: string }
): Promise<{ success: boolean; message?: MessageInfo; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        ...data,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('updateMessage error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 메시지 삭제
export async function deleteMessage(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/messages/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('deleteMessage error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 메시지 읽음 처리
export async function markMessageAsRead(messageId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/messages/${messageId}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('markMessageAsRead error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 미읽음 수신자 목록 조회 (재발송용)
export async function getUnreadRecipients(
  messageId: string
): Promise<{ success: boolean; recipients?: ReceiptInfo[]; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/messages/${messageId}/unread-recipients`);
    if (!response.ok) {
      return { success: false, error: 'Failed to fetch' };
    }

    return await response.json();
  } catch (error: any) {
    console.error('getUnreadRecipients error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 내 미읽음 메시지 수 조회
export async function getMyUnreadCount(): Promise<number> {
  try {
    const user = auth.currentUser;
    if (!user) return 0;

    const response = await fetch(
      `${API_BASE_URL}/messages/my/unread-count?firebaseUid=${user.uid}`
    );
    if (!response.ok) return 0;

    const data = await response.json();
    return data.success ? data.count : 0;
  } catch (error) {
    console.error('getMyUnreadCount error:', error);
    return 0;
  }
}

// 내 메시지 목록 조회
export async function getMyMessages(
  limit = 50,
  offset = 0
): Promise<{ id: string; messageId: string; title: string; body: string; read: boolean; readAt?: string; createdAt: string }[]> {
  try {
    const user = auth.currentUser;
    if (!user) return [];

    const response = await fetch(
      `${API_BASE_URL}/messages/my/list?firebaseUid=${user.uid}&limit=${limit}&offset=${offset}`
    );
    if (!response.ok) return [];

    const data = await response.json();
    return data.success ? data.rows : [];
  } catch (error) {
    console.error('getMyMessages error:', error);
    return [];
  }
}

// ============================================================
// Sales API
// ============================================================

export interface SalesRecordInfo {
  storeCode: string;
  storeName: string | null;
  totalAmount: number;
  totalQty: number;
}

export interface SalesImportResult {
  sheetName?: string;
  totalRows: number;
  inserted: number;
  skipped: number;
  errorsSample: string[];
}

// 매장별 매출 조회
export async function getSalesByStore(
  from: string,
  to: string
): Promise<{ from: string; to: string; items: SalesRecordInfo[] }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/sales/by-store?from=${from}&to=${to}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch sales data');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('getSalesByStore error:', error);
    throw error;
  }
}

// Excel 매출 데이터 업로드
export async function importSalesExcel(
  fileUri: string,
  fileName: string,
  sourceKey?: string
): Promise<SalesImportResult> {
  try {
    const formData = new FormData();

    // React Native에서 파일 업로드
    const file = {
      uri: fileUri,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      name: fileName,
    } as any;

    formData.append('file', file);
    if (sourceKey) {
      formData.append('sourceKey', sourceKey);
    }

    const response = await fetch(`${API_BASE_URL}/sales/import-excel`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to import sales data');
    }

    return await response.json();
  } catch (error) {
    console.error('importSalesExcel error:', error);
    throw error;
  }
}

// 최근 매출 데이터 확인 (디버그용)
export async function getRecentSales(): Promise<{
  totalCount: number;
  dateRange: { min: string | null; max: string | null };
  recentItems: Array<{
    id: string;
    saleDate: string;
    storeCode: string;
    storeName: string | null;
    qty: number;
    amount: number;
    codeName: string | null;
  }>;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/debug-recent`);
    if (!response.ok) {
      throw new Error('Failed to fetch recent sales');
    }

    return await response.json();
  } catch (error) {
    console.error('getRecentSales error:', error);
    throw error;
  }
}

export interface SalesRecordInfo {
  id: string;
  storeCode: string;
  storeName: string | null;
  saleDate: string; // ISO 8601 datetime string
  amount: number;
  qty: number;
  productType: string | null;
  itemCode: string | null;
  codeName: string | null;
  sourceKey: string | null;
  uploadedAt: string; // ISO 8601 datetime string
}

// 매출 목록 조회 (필터링)
export async function getSalesList(
  storeCode?: string,
  from?: string, // YYYY-MM-DD
  to?: string,   // YYYY-MM-DD
  sourceKey?: string
): Promise<SalesRecordInfo[]> {
  try {
    const params = new URLSearchParams();
    if (storeCode) params.append('storeCode', storeCode);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (sourceKey) params.append('sourceKey', sourceKey);

    const url = `${API_BASE_URL}/sales${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch sales list');
    }

    return await response.json();
  } catch (error) {
    console.error('getSalesList error:', error);
    throw error;
  }
}

// 매출 단건 조회
export async function getSale(id: string): Promise<SalesRecordInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${id}`);

    if (!response.ok) {
      throw new Error('Failed to fetch sale');
    }

    return await response.json();
  } catch (error) {
    console.error('getSale error:', error);
    throw error;
  }
}

// 매출 생성
export async function createSale(data: {
  storeCode: string;
  storeName?: string;
  saleDate: string; // YYYY-MM-DD
  amount: number;
  qty?: number;
  productType?: string; // category로 사용
  itemCode?: string;
  codeName?: string; // description으로 사용
  sourceKey?: string;
}): Promise<SalesRecordInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to create sale');
    }

    return await response.json();
  } catch (error) {
    console.error('createSale error:', error);
    throw error;
  }
}

// 매출 수정
export async function updateSale(
  id: string,
  data: {
    storeCode?: string;
    storeName?: string;
    saleDate?: string; // YYYY-MM-DD
    amount?: number;
    qty?: number;
    productType?: string; // category로 사용
    itemCode?: string;
    codeName?: string; // description으로 사용
    sourceKey?: string;
  }
): Promise<SalesRecordInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to update sale');
    }

    return await response.json();
  } catch (error) {
    console.error('updateSale error:', error);
    throw error;
  }
}

// 매출 삭제
export async function deleteSale(id: string): Promise<{ success: boolean; id: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/sales/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete sale');
    }

    return await response.json();
  } catch (error) {
    console.error('deleteSale error:', error);
    throw error;
  }
}

// ==========================================
// 결재 시스템 API (PostgreSQL)
// ==========================================

export type ApprovalType = 'VACATION' | 'EXPENSE' | 'REPORT' | 'GENERAL';
export type ApprovalStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApproverStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApproverInput {
  order: number;
  employeeId: string;
  name: string;
  department?: string;
}

export interface ApprovalAttachmentInput {
  name: string;
  url: string;
  type: string;
  size: number;
}

// Approval type alias for backwards compatibility
export type ApprovalAttachment = ApprovalAttachmentInput;

// Approval details types
export interface VacationDetails {
  startDate: string;
  endDate: string;
  days: number;
}

export interface ExpenseDetails {
  amount: number;
  category: string;
  purpose: string;
}

export interface ReportDetails {
  project: string;
  period: string;
}

// ============================================================
// Approval Constants
// ============================================================

export const APPROVAL_TYPE_LABELS: Record<string, string> = {
  GENERAL: '일반',
  EXPENSE: '지출',
  VACATION: '휴가',
  PURCHASE: '구매',
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  DRAFT: '임시저장',
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
};

export const APPROVAL_STATUS_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  PENDING: '#f59e0b',
  APPROVED: '#10b981',
  REJECTED: '#ef4444',
};

export interface ApproverInfo {
  id: string;
  order: number;
  employeeId: string;
  name: string;
  department?: string;
  status: ApproverStatus;
  comment?: string;
  processedAt?: string;
}

export interface ApprovalAttachmentInfo {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface ApprovalInfo {
  id: string;
  authorId: string;
  authorName: string;
  department?: string;
  type: ApprovalType;
  title: string;
  content?: string;
  details?: any;
  status: ApprovalStatus;
  currentStep: number;
  totalSteps?: number;
  currentApproverName?: string;
  myStatus?: ApproverStatus;
  approvers?: ApproverInfo[];
  attachments?: ApprovalAttachmentInfo[];
  createdAt: string;
  updatedAt?: string;
}

// 내가 올린 결재 문서 목록
export async function getMyDrafts(
  limit = 50,
  offset = 0
): Promise<{ success: boolean; rows: ApprovalInfo[]; total: number; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, rows: [], total: 0, error: 'Not logged in' };
    }

    const response = await fetch(
      `${API_BASE_URL}/approvals/my-drafts?firebaseUid=${user.uid}&limit=${limit}&offset=${offset}`
    );
    if (!response.ok) return { success: false, rows: [], total: 0, error: 'Failed to fetch' };

    return await response.json();
  } catch (error: any) {
    console.error('getMyDrafts error:', error);
    return { success: false, rows: [], total: 0, error: error?.message || 'Network error' };
  }
}

// 내가 승인할 결재 문서 목록
export async function getPendingApprovals(
  limit = 50,
  offset = 0
): Promise<{ success: boolean; rows: ApprovalInfo[]; total: number; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, rows: [], total: 0, error: 'Not logged in' };
    }

    const response = await fetch(
      `${API_BASE_URL}/approvals/pending?firebaseUid=${user.uid}&limit=${limit}&offset=${offset}`
    );
    if (!response.ok) return { success: false, rows: [], total: 0, error: 'Failed to fetch' };

    return await response.json();
  } catch (error: any) {
    console.error('getPendingApprovals error:', error);
    return { success: false, rows: [], total: 0, error: error?.message || 'Network error' };
  }
}

// 내가 처리한 결재 문서 목록
export async function getProcessedApprovals(
  limit = 50,
  offset = 0
): Promise<{ success: boolean; rows: ApprovalInfo[]; total: number; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, rows: [], total: 0, error: 'Not logged in' };
    }

    const response = await fetch(
      `${API_BASE_URL}/approvals/processed?firebaseUid=${user.uid}&limit=${limit}&offset=${offset}`
    );
    if (!response.ok) return { success: false, rows: [], total: 0, error: 'Failed to fetch' };

    return await response.json();
  } catch (error: any) {
    console.error('getProcessedApprovals error:', error);
    return { success: false, rows: [], total: 0, error: error?.message || 'Network error' };
  }
}

// 결재 문서 상세 조회
export async function getApproval(id: string): Promise<{ success: boolean; approval?: ApprovalInfo; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/approvals/${id}`);
    if (!response.ok) return { success: false, error: 'Failed to fetch' };

    return await response.json();
  } catch (error: any) {
    console.error('getApproval error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 결재 문서 생성
export async function createApproval(data: {
  type: ApprovalType;
  title: string;
  content: string;
  details?: any;
  approvers: ApproverInput[];
  attachments?: ApprovalAttachmentInput[];
}): Promise<{ success: boolean; approval?: ApprovalInfo; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        type: data.type,
        title: data.title,
        content: data.content,
        details: data.details,
        approvers: data.approvers,
        attachments: data.attachments,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('createApproval error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 결재 처리 (승인/반려)
export async function processApproval(
  id: string,
  action: 'APPROVED' | 'REJECTED',
  comment?: string
): Promise<{ success: boolean; approval?: ApprovalInfo; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/approvals/${id}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
        action,
        comment,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('processApproval error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}

// 결재 문서 삭제
export async function deleteApproval(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    const response = await fetch(`${API_BASE_URL}/approvals/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebaseUid: user.uid,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error('deleteApproval error:', error);
    return { success: false, error: error?.message || 'Network error' };
  }
}
