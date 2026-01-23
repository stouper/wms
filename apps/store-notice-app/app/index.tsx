// app/index.tsx (통파일 교체본) - 로그인 상태에 따라 /auth/login 또는 /admin 또는 /message로 이동
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

// ✅ 대부분 프로젝트에서 firebaseConfig는 루트에 있음
import { auth, db } from "../firebaseConfig";
import { authenticateWithCoreApi, EmployeeInfo } from "../lib/authApi";

type Me = {
  companyId?: string;
  role?: "OWNER" | "MANAGER" | "SALES";
  status?: "PENDING" | "ACTIVE" | "REJECTED" | "DISABLED";
  storeId?: string | null;
  department?: string | null;

  // ⚠️ DEPRECATED (backwards compatibility)
  active?: boolean;
} | null;

// Employee role → admin 여부 판단
const isAdminRole = (role: string): boolean => {
  return ["HQ_ADMIN", "HQ_WMS"].includes(role);
};

export default function Index() {
  const router = useRouter();
  const pathname = usePathname();

  const [authReady, setAuthReady] = useState(false);
  const [meReady, setMeReady] = useState(false);
  const [me, setMe] = useState<Me>(null);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);

  const redirected = useRef(false);
  const unsubMeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setAuthReady(true);

      // 기존 me 구독 해제
      if (unsubMeRef.current) {
        unsubMeRef.current();
        unsubMeRef.current = null;
      }

      setMe(null);
      setEmployee(null);
      setMeReady(false);

      if (!u) {
        setMeReady(true);
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
      }

      // 내 users 문서 구독 (Firestore - 과도기 유지)
      unsubMeRef.current = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          setMe(snap.exists() ? (snap.data() as any) : null);
          setMeReady(true);
        },
        () => {
          setMe(null);
          setMeReady(true);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubMeRef.current) unsubMeRef.current();
    };
  }, []);

  useEffect(() => {
    if (redirected.current) return;
    if (!authReady || !meReady) return;

    const u = auth.currentUser;
    if (!u) {
      if (pathname !== "/auth/login") {
        redirected.current = true;
        router.replace("/auth/login");
      }
      return;
    }

    // ✅ Employee 기반 분기 (core-api 우선)
    if (employee) {
      // Employee status 확인
      if (employee.status !== "ACTIVE") {
        // PENDING/DISABLED → 대기 화면에서 처리
        return;
      }

      // Employee role로 분기
      const isAdmin = isAdminRole(employee.role);
      const target = isAdmin ? "/admin" : "/staff";

      if (pathname !== target) {
        redirected.current = true;
        router.replace(target);
      }
      return;
    }

    // ✅ Firestore 기반 분기 (과도기 - Employee 없을 때)
    if (!me?.role || !me?.companyId) return;

    // Multi-tenant: Check status instead of active
    if (me.status !== "ACTIVE") {
      // PENDING/REJECTED/DISABLED users stay here
      return;
    }

    // Multi-tenant: Admin roles are OWNER/MANAGER
    const isAdmin = ["OWNER", "MANAGER"].includes(me.role);
    const target = isAdmin ? "/admin" : "/staff";

    if (pathname !== target) {
      redirected.current = true;
      router.replace(target);
    }
  }, [authReady, meReady, me?.role, me?.status, me?.companyId, employee, pathname, router]);

  if (!authReady || !meReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // ✅ Employee 또는 Firestore 기반 승인대기 화면
  const currentStatus = employee?.status || me?.status;
  if (auth.currentUser && currentStatus && currentStatus !== "ACTIVE") {
    const statusMessages: Record<string, string> = {
      PENDING: "관리자 승인 대기 중입니다.\n승인 후 앱을 사용할 수 있습니다.",
      REJECTED: "가입이 거부되었습니다.\n관리자에게 문의하세요.",
      DISABLED: "계정이 비활성화되었습니다.\n관리자에게 문의하세요.",
    };

    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: "#0B0C10" }}>
        <Text style={{ textAlign: "center", fontSize: 16, color: "#E6E7EB" }}>
          {statusMessages[currentStatus] || "계정 상태를 확인 중입니다."}
        </Text>
        {employee && (
          <Text style={{ textAlign: "center", fontSize: 12, color: "#A9AFBC", marginTop: 8 }}>
            {employee.name} ({employee.role})
          </Text>
        )}
      </View>
    );
  }

  // 곧 replace 됨
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
