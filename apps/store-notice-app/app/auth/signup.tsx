// app/auth/signup.tsx
// ✅ Multi-tenant: Create company OR join with invite code

import React, { useState } from "react";
import {
  Alert,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { useRouter } from "expo-router";
import { httpsCallable, getFunctions } from "firebase/functions";

type SignupMode = "choose" | "create" | "join";

export default function Signup() {
  const router = useRouter();
  const [mode, setMode] = useState<SignupMode>("choose");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [phone, setPhone] = useState("");
  const [requestedDepartment, setRequestedDepartment] = useState("");
  const [loading, setLoading] = useState(false);

  const functions = getFunctions();

  // ============================================================
  // Create Company Flow
  // ============================================================
  const onCreateCompany = async () => {
    try {
      if (!email.trim() || !pw.trim() || !name.trim() || !companyName.trim()) {
        Alert.alert("확인", "모든 필드를 입력해 주세요.");
        return;
      }
      setLoading(true);

      // 1. Firebase Auth 회원가입
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);

      // 2. Cloud Function 호출: createCompany
      const createCompanyFn = httpsCallable(functions, "createCompany");
      const result = await createCompanyFn({ companyName: companyName.trim() });
      const data = result.data as any;

      Alert.alert(
        "회사 생성 완료!",
        `회사가 생성되었습니다.\n\n초대 코드: ${data.inviteCode}\n\n이 코드를 팀원에게 공유하세요.`,
        [
          {
            text: "확인",
            onPress: () => router.replace("/"),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("회사 생성 실패", e?.message ?? "잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Join with Invite Code Flow
  // ============================================================
  const onJoinWithInvite = async () => {
    try {
      if (!email.trim() || !pw.trim() || !name.trim() || !inviteCode.trim()) {
        Alert.alert("확인", "모든 필드를 입력해 주세요.");
        return;
      }
      setLoading(true);

      // 1. Firebase Auth 회원가입
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);

      // 2. Cloud Function 호출: joinWithInvite
      const joinWithInviteFn = httpsCallable(functions, "joinWithInvite");
      const result = await joinWithInviteFn({
        inviteCode: inviteCode.trim().toUpperCase(),
        role: "SALES",
        name: name.trim(),
        phone: phone.trim() || null,
        requestedDepartment: requestedDepartment.trim() || null,
      });
      const data = result.data as any;

      Alert.alert(
        "가입 완료",
        `${data.companyName}에 가입 요청을 보냈습니다.\n관리자 승인 후 이용할 수 있습니다.`,
        [
          {
            text: "확인",
            onPress: () => router.replace("/"),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("가입 실패", e?.message ?? "초대 코드를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // UI: Choose Mode
  // ============================================================
  if (mode === "choose") {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B0C10" }}>
        <View style={{ alignItems: "center", paddingTop: 100, paddingBottom: 50 }}>
          <Text style={{ fontSize: 32, fontWeight: "900", color: "#E6E7EB" }}>ESKA</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#A9AFBC", marginTop: 2 }}>
            by CROCS
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#E6E7EB" }}>회원가입</Text>
            <Text style={{ fontSize: 13, color: "#A9AFBC", marginTop: 6 }}>
              새 회사를 만들거나 초대 코드로 가입하세요.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setMode("create")}
            activeOpacity={0.9}
            style={{
              height: 56,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#1E5BFF",
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
              새 회사 만들기
            </Text>
            <Text style={{ color: "#bfdbfe", fontSize: 12, marginTop: 2 }}>
              첫 관리자가 됩니다
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setMode("join")}
            activeOpacity={0.9}
            style={{
              height: 56,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#10b981",
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
              초대 코드로 가입
            </Text>
            <Text style={{ color: "#d1fae5", fontSize: 12, marginTop: 2 }}>
              팀원으로 참여합니다
            </Text>
          </TouchableOpacity>

          <View style={{ alignItems: "center", marginTop: 14 }}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={{ color: "#1E5BFF", fontWeight: "700" }}>뒤로 가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ============================================================
  // UI: Create Company
  // ============================================================
  if (mode === "create") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#0B0C10" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", paddingTop: 70, paddingBottom: 30 }}>
            <Text style={{ fontSize: 28, fontWeight: "900", color: "#E6E7EB" }}>새 회사 만들기</Text>
          </View>

          <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 40 }}>
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 13, color: "#A9AFBC" }}>
                회사를 만들면 자동으로 관리자(OWNER)가 됩니다.
              </Text>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>회사명</Text>
              <TextInput
                placeholder="예: 크록스 코리아"
                placeholderTextColor="#64748b"
                value={companyName}
                onChangeText={setCompanyName}
                style={{
                  borderWidth: 1,
                  borderColor: "#2A2F3A",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#1A1D24",
                  fontSize: 14,
                  color: "#E6E7EB",
                }}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>이메일</Text>
              <TextInput
                placeholder="name@example.com"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={{
                  borderWidth: 1,
                  borderColor: "#2A2F3A",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#1A1D24",
                  fontSize: 14,
                  color: "#E6E7EB",
                }}
              />
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>비밀번호</Text>
              <TextInput
                placeholder="비밀번호(6자 이상)"
                placeholderTextColor="#64748b"
                secureTextEntry
                value={pw}
                onChangeText={setPw}
                style={{
                  borderWidth: 1,
                  borderColor: "#2A2F3A",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#1A1D24",
                  fontSize: 14,
                  color: "#E6E7EB",
                }}
              />
            </View>

            <View style={{ marginBottom: 22 }}>
              <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>이름</Text>
              <TextInput
                placeholder="실명"
                placeholderTextColor="#64748b"
                value={name}
                onChangeText={setName}
                style={{
                  borderWidth: 1,
                  borderColor: "#2A2F3A",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#1A1D24",
                  fontSize: 14,
                  color: "#E6E7EB",
                }}
              />
            </View>

            <TouchableOpacity
              onPress={onCreateCompany}
              disabled={loading}
              activeOpacity={0.9}
              style={{
                height: 48,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: loading ? "#93c5fd" : "#1d4ed8",
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>회사 생성</Text>
              )}
            </TouchableOpacity>

            <View style={{ alignItems: "center", marginTop: 14 }}>
              <TouchableOpacity onPress={() => setMode("choose")} activeOpacity={0.8}>
                <Text style={{ color: "#1E5BFF", fontWeight: "700" }}>뒤로 가기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ============================================================
  // UI: Join with Invite Code
  // ============================================================
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0B0C10" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", paddingTop: 70, paddingBottom: 30 }}>
          <Text style={{ fontSize: 28, fontWeight: "900", color: "#E6E7EB" }}>초대 코드로 가입</Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 40 }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 13, color: "#A9AFBC" }}>
              관리자에게 받은 8자리 초대 코드를 입력하세요.
            </Text>
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>초대 코드</Text>
            <TextInput
              placeholder="예: ABC12345"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={setInviteCode}
              style={{
                borderWidth: 1,
                borderColor: "#2A2F3A",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#1A1D24",
                fontSize: 14,
                color: "#E6E7EB",
                letterSpacing: 2,
                fontWeight: "600",
              }}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>이메일</Text>
            <TextInput
              placeholder="name@example.com"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={{
                borderWidth: 1,
                borderColor: "#2A2F3A",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#1A1D24",
                fontSize: 14,
                color: "#E6E7EB",
              }}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>비밀번호</Text>
            <TextInput
              placeholder="비밀번호(6자 이상)"
              placeholderTextColor="#64748b"
              secureTextEntry
              value={pw}
              onChangeText={setPw}
              style={{
                borderWidth: 1,
                borderColor: "#2A2F3A",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#1A1D24",
                fontSize: 14,
                color: "#E6E7EB",
              }}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>이름</Text>
            <TextInput
              placeholder="실명"
              placeholderTextColor="#64748b"
              value={name}
              onChangeText={setName}
              style={{
                borderWidth: 1,
                borderColor: "#2A2F3A",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#1A1D24",
                fontSize: 14,
                color: "#E6E7EB",
              }}
            />
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>
              전화번호 (선택사항)
            </Text>
            <TextInput
              placeholder="예: 010-1234-5678"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              style={{
                borderWidth: 1,
                borderColor: "#2A2F3A",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#1A1D24",
                fontSize: 14,
                color: "#E6E7EB",
              }}
            />
          </View>

          <View style={{ marginBottom: 22 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>
              희망 부서 (선택사항)
            </Text>
            <TextInput
              placeholder="예: 영업팀, 물류팀"
              placeholderTextColor="#64748b"
              value={requestedDepartment}
              onChangeText={setRequestedDepartment}
              style={{
                borderWidth: 1,
                borderColor: "#2A2F3A",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: "#1A1D24",
                fontSize: 14,
                color: "#E6E7EB",
              }}
            />
          </View>

          <TouchableOpacity
            onPress={onJoinWithInvite}
            disabled={loading}
            activeOpacity={0.9}
            style={{
              height: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: loading ? "#6ee7b7" : "#10b981",
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>가입 요청</Text>
            )}
          </TouchableOpacity>

          <View style={{ alignItems: "center", marginTop: 14 }}>
            <TouchableOpacity onPress={() => setMode("choose")} activeOpacity={0.8}>
              <Text style={{ color: "#1E5BFF", fontWeight: "700" }}>뒤로 가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
