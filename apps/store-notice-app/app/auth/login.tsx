// app/auth/login.tsx
import React, { useState } from "react";
import {
  Alert,
  TextInput,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { useRouter } from "expo-router";
import { authenticateWithCoreApi } from "../../lib/authApi";
import { registerPushToken } from "../../lib/push/registerPushToken";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    try {
      setLoading(true);

      // 1. Firebase 로그인
      await signInWithEmailAndPassword(auth, email.trim(), pw);

      // 2. core-api 인증 (Employee 조회/생성)
      const result = await authenticateWithCoreApi();
      if (!result.success) {
        console.warn('core-api auth failed:', result.error);
        // core-api 실패해도 기존 Firestore 기반으로 진행 (과도기)
      } else {
        console.log('core-api auth success:', result.employee?.status);
      }

      // 3. 푸시 토큰 등록 (백그라운드로 실행)
      registerPushToken().catch((e) => {
        console.warn('Push token registration failed:', e);
      });

      router.replace("/");
    } catch (e: any) {
      Alert.alert("로그인 실패", e?.message ?? "이메일/비밀번호를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0B0C10" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 상단 텍스트 로고 */}
        <View style={{ alignItems: "center", paddingTop: 70, paddingBottom: 30 }}>
          <Text style={{ fontSize: 32, fontWeight: "900", color: "#E6E7EB" }}>ESKA</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#A9AFBC", marginTop: 2 }}>
            by CROCS
          </Text>
        </View>

        {/* 폼 영역 */}
        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 40 }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: "#E6E7EB" }}>로그인</Text>
            <Text style={{ fontSize: 13, color: "#A9AFBC", marginTop: 6 }}>
              관리자/직원 계정으로 로그인하세요.
            </Text>
          </View>

          {/* 이메일 */}
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

          {/* 비밀번호 */}
          <View style={{ marginBottom: 22 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>비밀번호</Text>
            <TextInput
              placeholder="●●●●●●●●"
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

          {/* 로그인 버튼 */}
          <TouchableOpacity
            onPress={onLogin}
            disabled={loading}
            activeOpacity={0.9}
            style={{
              height: 48,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: loading ? "#64748b" : "#1E5BFF",
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                로그인
              </Text>
            )}
          </TouchableOpacity>

          {/* 회원가입 */}
          <View style={{ alignItems: "center", marginTop: 14 }}>
            <TouchableOpacity onPress={() => router.push("/auth/signup")} activeOpacity={0.8}>
              <Text style={{ color: "#1E5BFF", fontWeight: "700" }}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
