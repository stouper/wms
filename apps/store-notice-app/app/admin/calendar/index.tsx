// app/admin/calendar/index.tsx
// ✅ PostgreSQL 연동: 달력 이벤트 (Firebase → PostgreSQL 마이그레이션 완료)

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../../components/ui/Card";
import {
  getEvents,
  createEvent,
  deleteEvent,
  EventInfo,
  getEmployees,
} from "../../../lib/authApi";

export default function CalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [eventsOnSelectedDate, setEventsOnSelectedDate] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // 일정 등록 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [pendingCount, setPendingCount] = useState(0);

  // PENDING 사용자 수 로드
  const loadPendingCount = useCallback(async () => {
    try {
      const employees = await getEmployees("PENDING");
      setPendingCount(employees.length);
    } catch (error) {
      console.error("loadPendingCount error:", error);
    }
  }, []);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  // 이벤트 로드
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      );
      const endOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0
      );

      const startDateStr = formatDate(startOfMonth);
      const endDateStr = formatDate(endOfMonth);

      const eventsList = await getEvents(startDateStr, endDateStr);
      setEvents(eventsList);
    } catch (error) {
      console.error("일정 로드 실패:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (selectedDate) {
      const filtered = events.filter((e) => e.date === selectedDate);
      setEventsOnSelectedDate(filtered);
    } else {
      setEventsOnSelectedDate([]);
    }
  }, [selectedDate, events]);

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleDatePress = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowAddModal(true);
  };

  const handleAddEvent = async () => {
    if (!title.trim()) {
      Alert.alert("확인", "일정 제목을 입력해주세요.");
      return;
    }

    if (!selectedDate) return;

    setSubmitting(true);
    try {
      const result = await createEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        date: selectedDate,
      });

      if (result.success) {
        Alert.alert("완료", "일정이 등록되었습니다.");
        setTitle("");
        setDescription("");
        setShowAddModal(false);
        loadEvents();
      } else {
        Alert.alert("오류", result.error || "일정 등록에 실패했습니다.");
      }
    } catch (error) {
      console.error("일정 등록 실패:", error);
      Alert.alert("오류", "일정 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    Alert.alert("일정 삭제", "이 일정을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            const result = await deleteEvent(eventId);
            if (result.success) {
              Alert.alert("완료", "일정이 삭제되었습니다.");
              loadEvents();
            } else {
              Alert.alert("오류", result.error || "일정 삭제에 실패했습니다.");
            }
          } catch (error) {
            console.error("일정 삭제 실패:", error);
            Alert.alert("오류", "일정 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const prevMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    );
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];
    const weeks: (number | null)[][] = [];

    // 빈 칸 채우기 (이전 달)
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    // 현재 달 날짜
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    // 주 단위로 나누기
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return (
      <View style={styles.calendar}>
        {/* 헤더 */}
        <View style={styles.calendarHeader}>
          <Pressable onPress={prevMonth} style={styles.monthButton}>
            <Text style={styles.monthButtonText}>◀</Text>
          </Pressable>
          <Text style={styles.monthTitle}>
            {year}년 {month + 1}월
          </Text>
          <Pressable onPress={nextMonth} style={styles.monthButton}>
            <Text style={styles.monthButtonText}>▶</Text>
          </Pressable>
        </View>

        {/* 요일 */}
        <View style={styles.weekdayRow}>
          {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
            <View key={index} style={styles.weekdayCell}>
              <Text
                style={[
                  styles.weekdayText,
                  index === 0 && styles.sundayText,
                  index === 6 && styles.saturdayText,
                ]}
              >
                {day}
              </Text>
            </View>
          ))}
        </View>

        {/* 날짜 */}
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((day, dayIndex) => {
              if (day === null) {
                return <View key={dayIndex} style={styles.dayCell} />;
              }

              const dateStr = formatDate(new Date(year, month, day));
              const hasEvent = events.some((e) => e.date === dateStr);
              const isToday = formatDate(new Date()) === dateStr;

              return (
                <Pressable
                  key={dayIndex}
                  style={[styles.dayCell, isToday && styles.todayCell]}
                  onPress={() => handleDatePress(dateStr)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      dayIndex === 0 && styles.sundayText,
                      dayIndex === 6 && styles.saturdayText,
                      isToday && styles.todayText,
                    ]}
                  >
                    {day}
                  </Text>
                  {hasEvent && <View style={styles.eventDot} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>일정 관리</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1E5BFF" />
          </View>
        ) : (
          <>
            <Card>{renderCalendar()}</Card>

            {/* 이번 달 일정 목록 */}
            {events.length > 0 && (
              <Card style={styles.eventListCard}>
                <Text style={styles.sectionTitle}>이번 달 일정</Text>
                {events.map((event) => (
                  <View key={event.id} style={styles.eventItem}>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventDate}>{event.date}</Text>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {event.title}
                        {event.description && (
                          <Text style={styles.eventDescription}>
                            {" "}
                            - {event.description}
                          </Text>
                        )}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteEvent(event.id)}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {/* 일정 등록 모달 */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>일정 등록</Text>
            <Text style={styles.modalDate}>{selectedDate}</Text>

            <Text style={styles.label}>제목</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="예) 회의, 외근 등"
              placeholderTextColor="#A9AFBC"
              editable={!submitting}
            />

            <Text style={styles.label}>내용</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="일정 내용을 입력하세요"
              placeholderTextColor="#A9AFBC"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!submitting}
            />

            {/* 해당 날짜의 기존 일정 표시 */}
            {eventsOnSelectedDate.length > 0 && (
              <View style={styles.existingEvents}>
                <Text style={styles.existingTitle}>이 날짜의 일정:</Text>
                {eventsOnSelectedDate.map((event) => (
                  <View key={event.id} style={styles.existingEventItem}>
                    <Text style={styles.existingEventTitle}>• {event.title}</Text>
                    <Pressable
                      onPress={() => {
                        setShowAddModal(false);
                        handleDeleteEvent(event.id);
                      }}
                      style={styles.existingDeleteButton}
                    >
                      <Text style={styles.existingDeleteText}>삭제</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.modalButtonRow}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowAddModal(false);
                  setTitle("");
                  setDescription("");
                }}
              >
                <Text style={styles.modalCancelButtonText}>취소</Text>
              </Pressable>

              <Pressable
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleAddEvent}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmButtonText}>등록</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 하단 네비게이션 바 */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomNavContainer}>
        <View style={styles.bottomNav}>
          <Pressable onPress={() => router.push("/admin")} style={styles.navButton}>
            <Text style={[styles.navIcon, styles.navActive]}>🏠</Text>
            <Text style={[styles.navText, styles.navActive]}>홈</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/admin/organization")}
            style={styles.navButton}
          >
            <Text style={styles.navIcon}>📊</Text>
            <Text style={styles.navText}>조직도</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/admin/settings")}
            style={styles.navButton}
          >
            <View style={styles.navIconContainer}>
              <Text style={styles.navIcon}>⚙️</Text>
              {pendingCount > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.navText}>설정</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B0C10" },
  container: { padding: 16, paddingBottom: 100 },

  title: {
    color: "#E6E7EB",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 16,
  },

  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },

  calendar: {
    paddingVertical: 8,
  },

  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  monthButton: {
    padding: 8,
  },

  monthButtonText: {
    color: "#1E5BFF",
    fontSize: 18,
    fontWeight: "bold",
  },

  monthTitle: {
    color: "#E6E7EB",
    fontSize: 18,
    fontWeight: "bold",
  },

  weekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },

  weekdayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },

  weekdayText: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "600",
  },

  sundayText: {
    color: "#EF4444",
  },

  saturdayText: {
    color: "#3B82F6",
  },

  weekRow: {
    flexDirection: "row",
  },

  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    position: "relative",
  },

  todayCell: {
    backgroundColor: "#1E5BFF20",
    borderRadius: 8,
  },

  dayText: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "500",
  },

  todayText: {
    color: "#1E5BFF",
    fontWeight: "bold",
  },

  eventDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#1E5BFF",
  },

  eventListCard: {
    marginTop: 16,
  },

  sectionTitle: {
    color: "#E6E7EB",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },

  eventItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2F3A",
  },

  eventInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  eventDate: {
    color: "#1E5BFF",
    fontSize: 12,
    fontWeight: "600",
    width: 80,
  },

  eventTitle: {
    color: "#E6E7EB",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },

  eventDescription: {
    color: "#A9AFBC",
    fontSize: 13,
    fontWeight: "400",
  },

  deleteButton: {
    padding: 4,
  },

  deleteButtonText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "bold",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContent: {
    backgroundColor: "#1A1D24",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },

  modalTitle: {
    color: "#E6E7EB",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },

  modalDate: {
    color: "#1E5BFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },

  label: {
    color: "#E6E7EB",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#0B0C10",
    color: "#E6E7EB",
    fontSize: 15,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2F3A",
    marginBottom: 16,
  },

  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  existingEvents: {
    backgroundColor: "#0B0C10",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },

  existingTitle: {
    color: "#A9AFBC",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },

  existingEventItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },

  existingEventTitle: {
    color: "#E6E7EB",
    fontSize: 13,
    flex: 1,
  },

  existingDeleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  existingDeleteText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600",
  },

  modalButtonRow: {
    flexDirection: "row",
    gap: 8,
  },

  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },

  modalCancelButton: {
    backgroundColor: "#2A2F3A",
  },

  modalConfirmButton: {
    backgroundColor: "#1E5BFF",
  },

  modalCancelButtonText: {
    color: "#E6E7EB",
    fontSize: 15,
    fontWeight: "600",
  },

  modalConfirmButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },

  bottomNavContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1A1D24",
  },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#1A1D24",
    borderTopWidth: 1,
    borderTopColor: "#2A2F3A",
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  navIconContainer: {
    position: "relative",
  },
  navIcon: {
    fontSize: 16,
    marginBottom: 2,
    opacity: 0.5,
  },
  navBadge: {
    position: "absolute",
    top: -3,
    right: -6,
    backgroundColor: "#EF4444",
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  navBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "900",
  },
  navText: {
    color: "#A9AFBC",
    fontSize: 9,
    fontWeight: "600",
    opacity: 0.5,
  },
  navActive: {
    opacity: 1,
    color: "#1E5BFF",
  },
});
