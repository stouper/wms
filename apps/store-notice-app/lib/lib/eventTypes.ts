// lib/eventTypes.ts
// 일정 시스템 타입 정의

import { Timestamp } from "firebase/firestore";

// 일정
export interface Event {
  id: string;
  companyId: string;

  // 일정 정보
  title: string;
  description: string;
  date: string; // YYYY-MM-DD 형식

  // 작성자
  createdBy: string;
  createdByName: string;

  // 시간
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
