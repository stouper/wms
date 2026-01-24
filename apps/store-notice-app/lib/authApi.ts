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
