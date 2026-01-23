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
  storeId: string | null;
  storeCode: string | null;
  storeName: string | null;
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
  storeId?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/employees/${employeeId}/approve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role, storeId }),
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
