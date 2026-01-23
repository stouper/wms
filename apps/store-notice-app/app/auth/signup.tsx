// app/auth/signup.tsx
// 회원가입 화면 - PostgreSQL Employee 직접 연동

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
import { registerEmployee } from "../../lib/authApi";

type WorkType = "hq" | "store" | null;

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [workType, setWorkType] = useState<WorkType>(null);
  const [loading, setLoading] = useState(false);

  const onSignup = async () => {
    // 유효성 검사
    if (!email.trim() || !pw.trim() || !name.trim() || !phone.trim()) {
      Alert.alert("확인", "모든 필수 항목을 입력해 주세요.");
      return;
    }
    if (!workType) {
      Alert.alert("확인", "본사/매장을 선택해 주세요.");
      return;
    }
    if (pw.length < 6) {
      Alert.alert("확인", "비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      // 1. Firebase Auth 회원가입
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      const firebaseUid = cred.user.uid;

      // 2. PostgreSQL Employee 생성 (PENDING 상태)
      const result = await registerEmployee({
        firebaseUid,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        isHq: workType === "hq",
      });

      if (!result.success) {
        Alert.alert("가입 실패", result.error || "잠시 후 다시 시도해 주세요.");
        return;
      }

      Alert.alert(
        "가입 신청 완료",
        "관리자 승인 후 이용할 수 있습니다.\n승인이 완료되면 앱에서 로그인해 주세요.",
        [
          {
            text: "확인",
            onPress: () => router.replace("/auth/login"),
          },
        ]
      );
    } catch (e: any) {
      let message = "잠시 후 다시 시도해 주세요.";
      if (e?.code === "auth/email-already-in-use") {
        message = "이미 사용 중인 이메일입니다.";
      } else if (e?.code === "auth/invalid-email") {
        message = "올바른 이메일 형식이 아닙니다.";
      } else if (e?.code === "auth/weak-password") {
        message = "비밀번호가 너무 약합니다.";
      }
      Alert.alert("가입 실패", message);
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
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", paddingTop: 60, paddingBottom: 20 }}>
          <Text style={{ fontSize: 32, fontWeight: "900", color: "#E6E7EB" }}>ESKA</Text>
          <Text style={{ fontSize: 14, color: "#A9AFBC", marginTop: 4 }}>회원가입</Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 40 }}>
          {/* 안내 문구 */}
          <View style={{
            backgroundColor: "#1A1D24",
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            borderLeftWidth: 4,
            borderLeftColor: "#F59E0B",
          }}>
            <Text style={{ color: "#F59E0B", fontWeight: "700", marginBottom: 4 }}>
              관리자 승인 필요
            </Text>
            <Text style={{ color: "#A9AFBC", fontSize: 13, lineHeight: 18 }}>
              회원가입 신청 후 관리자 승인이 완료되면{"\n"}앱을 이용할 수 있습니다.
            </Text>
          </View>

          {/* 이메일 */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>
              이메일 <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
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
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>
              비밀번호 <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            <TextInput
              placeholder="6자 이상"
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

          {/* 이름 */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>
              이름 <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
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

          {/* 전화번호 */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 6 }}>
              전화번호 <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            <TextInput
              placeholder="010-1234-5678"
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

          {/* 본사/매장 선택 */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 12, color: "#A9AFBC", marginBottom: 8 }}>
              근무지 <Text style={{ color: "#EF4444" }}>*</Text>
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setWorkType("hq")}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  borderWidth: 2,
                  borderColor: workType === "hq" ? "#1E5BFF" : "#2A2F3A",
                  backgroundColor: workType === "hq" ? "#1E3A5F" : "#1A1D24",
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4 }}>🏢</Text>
                <Text style={{
                  color: workType === "hq" ? "#1E5BFF" : "#E6E7EB",
                  fontWeight: "700",
                  fontSize: 15,
                }}>
                  본사
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setWorkType("store")}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  borderWidth: 2,
                  borderColor: workType === "store" ? "#10B981" : "#2A2F3A",
                  backgroundColor: workType === "store" ? "#1A2F24" : "#1A1D24",
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4 }}>🏪</Text>
                <Text style={{
                  color: workType === "store" ? "#10B981" : "#E6E7EB",
                  fontWeight: "700",
                  fontSize: 15,
                }}>
                  매장
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 가입 버튼 */}
          <TouchableOpacity
            onPress={onSignup}
            disabled={loading}
            activeOpacity={0.9}
            style={{
              height: 52,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: loading ? "#6B7280" : "#1E5BFF",
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
                가입 신청
              </Text>
            )}
          </TouchableOpacity>

          {/* 뒤로 가기 */}
          <View style={{ alignItems: "center", marginTop: 16 }}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={{ color: "#1E5BFF", fontWeight: "700" }}>뒤로 가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
