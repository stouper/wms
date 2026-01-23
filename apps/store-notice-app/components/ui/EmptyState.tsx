import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: "700", color: "#E6E7EB" },
  sub: { fontSize: 14, fontWeight: "500", color: "#A9AFBC" },
});
