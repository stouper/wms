import React, { ReactNode } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

export default function Card({
  children,
  style
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1D24",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2F3A",
    padding: 10,
  },
});
