// app/index.tsx - PostgreSQL Employee 기반 인증 및 라우팅
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebaseConfig";
import { authenticateWithCoreApi, EmployeeInfo } from "../lib/authApi";

// Employee role → admin 여부 판단 (MASTER 또는 ADMIN 역할이면 /admin)
const isAdminRole = (role: string): boolean => {
  return role === "MASTER" || role === "ADMIN";
};

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();

  const [authReady, setAuthReady] = useState(false);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [employeeReady, setEmployeeReady] = useState(false);

  const redirected = useRef(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setAuthReady(true);
      setEmployee(null);
      setEmployeeReady(false);

      if (!u) {
        setEmployeeReady(true);
        return;
      }

      // ✅ core-api Employee 정보 가져오기
      try {
        const result = await authenticateWithCoreApi();
        if (result.success && result.employee) {
          setEmployee(result.employee);
        }
      } catch (error) {
        console.warn("core-api auth failed:", error);
      } finally {
        setEmployeeReady(true);
      }
    });

    return () => {
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (redirected.current) return;
    if (!authReady || !employeeReady) return;

    const u = auth.currentUser;
    if (!u) {
      if (pathname !== "/auth/login") {
        redirected.current = true;
        router.replace("/auth/login");
      }
      return;
    }

    // ✅ Employee 기반 분기
    if (!employee) {
      // Employee 정보 없음 → 회원가입 화면으로
      return;
    }

    // Employee status 확인
    if (employee.status !== "ACTIVE") {
      // PENDING/DISABLED → 대기 화면 표시
      return;
    }

    // Employee role로 분기 (ADMIN → /admin, STAFF → /staff)
    const isAdmin = isAdminRole(employee.role);
    const target = isAdmin ? "/admin" : "/staff";

    if (pathname !== target) {
      redirected.current = true;
      router.replace(target);
    }
  }, [authReady, employeeReady, employee, pathname, router]);

  if (!authReady || !employeeReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // ✅ Employee 기반 승인대기 화면
  if (auth.currentUser && employee && employee.status !== "ACTIVE") {
    const statusMessages: Record<string, string> = {
      PENDING: "관리자 승인 대기 중입니다.\n승인 후 앱을 사용할 수 있습니다.",
      REJECTED: "가입이 거부되었습니다.\n관리자에게 문의하세요.",
      DISABLED: "계정이 비활성화되었습니다.\n관리자에게 문의하세요.",
    };

    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "#0B0C10" }}>
        <Text style={{ textAlign: "center", fontSize: 16, color: "#E6E7EB" }}>
          {statusMessages[employee.status] || "계정 상태를 확인 중입니다."}
        </Text>
        <Text style={{ textAlign: "center", fontSize: 12, color: "#A9AFBC", marginTop: 8 }}>
          {employee.name} ({employee.role})
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
