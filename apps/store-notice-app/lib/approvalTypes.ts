// lib/approvalTypes.ts
// 결재 시스템 타입 정의

import { Timestamp } from "firebase/firestore";

// 결재 문서 종류
export type ApprovalType = "VACATION" | "EXPENSE" | "REPORT" | "GENERAL";

// 승인 상태
export type ApprovalStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

// 승인자 상태
export type ApproverStatus = "PENDING" | "APPROVED" | "REJECTED";

// 승인자 정보
export interface Approver {
  order: number;
  userId: string;
  name: string;
  department?: string;
  status: ApproverStatus;
  comment: string | null;
  approvedAt: Timestamp | null;
}

// 첨부 파일
export interface ApprovalAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

// 서류별 상세 정보
export interface VacationDetails {
  startDate: string;
  endDate: string;
  days: number;
}

export interface ExpenseDetails {
  amount: number;
  category: string;
  purpose: string;
}

export interface ReportDetails {
  project: string;
  period: string;
}

export type ApprovalDetails = VacationDetails | ExpenseDetails | ReportDetails | null;

// 결재 문서
export interface Approval {
  id: string;
  companyId: string;

  // 기안자 정보
  authorId: string;
  authorName: string;
  department: string;

  // 문서 정보
  type: ApprovalType;
  title: string;
  content: string;

  // 서류별 상세 정보
  details: ApprovalDetails;

  // 첨부 파일
  attachments: ApprovalAttachment[];

  // 결재선
  approvers: Approver[];

  // 상태
  status: ApprovalStatus;
  currentStep: number; // 현재 승인 단계 (1부터 시작)

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 서류 종류 라벨
export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  VACATION: "휴가 신청서",
  EXPENSE: "지출 결의서",
  REPORT: "업무 보고서",
  GENERAL: "범용 서류",
};

// 상태 라벨
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  DRAFT: "임시저장",
  PENDING: "진행 중",
  APPROVED: "승인 완료",
  REJECTED: "반려됨",
};

// 상태 색상
export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  DRAFT: "#64748b",
  PENDING: "#F59E0B",
  APPROVED: "#10B981",
  REJECTED: "#EF4444",
};
