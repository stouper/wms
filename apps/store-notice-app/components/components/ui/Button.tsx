import React from "react";
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle } from "react-native";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: ViewStyle;
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  full,
  style,
}: Props) {
  const styleMap = {
    primary: { bg: "#4F8EF7", fg: "#0B0C10" },
    ghost: { bg: "transparent", fg: "#E6E7EB" },
    danger: { bg: "#FF5D5D", fg: "#0B0C10" },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: styleMap.bg, opacity: disabled || loading ? 0.6 : 1 },
        full && { width: "100%" },
        variant === "ghost" && styles.ghost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={[styles.text, { color: styleMap.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2A2F3A",
  },
  text: { fontSize: 14, fontWeight: "600" },
  ghost: { borderColor: "#2A2F3A" },
});
