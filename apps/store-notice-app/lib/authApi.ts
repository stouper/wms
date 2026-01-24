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
  role: 'HQ_ADMIN' | 'HQ_WMS' | 'SALES' | 'STORE_MANAGER' | 'STORE_STAFF';
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
