// scripts/seed-test-data.ts
// 테스트 데이터 생성 스크립트

import * as admin from "firebase-admin";

// Firebase Admin 초기화
const serviceAccount = require("../../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

interface CompanyData {
  name: string;
  inviteCode: string;
  users: UserData[];
}

interface UserData {
  email: string;
  password: string;
  name: string;
  role: "OWNER" | "EXEC" | "MANAGER" | "SALES" | "STORE" | "ETC";
  status: "ACTIVE" | "PENDING";
  phone?: string;
  requestedDepartment?: string;
}

const companies: CompanyData[] = [
  {
    name: "크록스 코리아",
    inviteCode: "CROCS001",
    users: [
      {
        email: "owner@crocs.com",
        password: "test123456",
        name: "김대표",
        role: "OWNER",
        status: "ACTIVE",
        phone: "010-1111-1111",
      },
      {
        email: "exec@crocs.com",
        password: "test123456",
        name: "박임원",
        role: "EXEC",
        status: "ACTIVE",
        phone: "010-1111-2222",
      },
      {
        email: "sales@crocs.com",
        password: "test123456",
        name: "이영업",
        role: "SALES",
        status: "ACTIVE",
        phone: "010-1111-3333",
        requestedDepartment: "영업팀",
      },
      {
        email: "store@crocs.com",
        password: "test123456",
        name: "최매장",
        role: "STORE",
        status: "ACTIVE",
        phone: "010-1111-4444",
        requestedDepartment: "강남점",
      },
    ],
  },
  {
    name: "나이키 코리아",
    inviteCode: "NIKE0002",
    users: [
      {
        email: "owner@nike.com",
        password: "test123456",
        name: "정사장",
        role: "OWNER",
        status: "ACTIVE",
        phone: "010-2222-1111",
      },
      {
        email: "manager@nike.com",
        password: "test123456",
        name: "강관리",
        role: "MANAGER",
        status: "ACTIVE",
        phone: "010-2222-2222",
      },
      {
        email: "sales@nike.com",
        password: "test123456",
        name: "송영업",
        role: "SALES",
        status: "ACTIVE",
        phone: "010-2222-3333",
        requestedDepartment: "마케팅팀",
      },
      {
        email: "store@nike.com",
        password: "test123456",
        name: "윤매장",
        role: "STORE",
        status: "ACTIVE",
        phone: "010-2222-4444",
        requestedDepartment: "홍대점",
      },
    ],
  },
  {
    name: "아디다스 코리아",
    inviteCode: "ADIDAS03",
    users: [
      {
        email: "owner@adidas.com",
        password: "test123456",
        name: "한대표",
        role: "OWNER",
        status: "ACTIVE",
        phone: "010-3333-1111",
      },
      {
        email: "exec@adidas.com",
        password: "test123456",
        name: "오임원",
        role: "EXEC",
        status: "ACTIVE",
        phone: "010-3333-2222",
      },
      {
        email: "sales@adidas.com",
        password: "test123456",
        name: "임영업",
        role: "SALES",
        status: "ACTIVE",
        phone: "010-3333-3333",
        requestedDepartment: "영업팀",
      },
      {
        email: "store@adidas.com",
        password: "test123456",
        name: "신매장",
        role: "STORE",
        status: "ACTIVE",
        phone: "010-3333-4444",
        requestedDepartment: "명동점",
      },
    ],
  },
];

async function createCompanyAndUsers(companyData: CompanyData) {
  console.log(`\n📦 회사 생성 중: ${companyData.name}`);

  try {
    // 1. 회사 생성
    const companyRef = await db.collection("companies").add({
      name: companyData.name,
      inviteCode: companyData.inviteCode,
      createdBy: "seed-script",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ 회사 생성 완료: ${companyData.name} (ID: ${companyRef.id})`);
    console.log(`   초대 코드: ${companyData.inviteCode}`);

    // 2. 사용자 생성
    for (const userData of companyData.users) {
      try {
        // Firebase Auth 사용자 생성
        const userRecord = await auth.createUser({
          email: userData.email,
          password: userData.password,
          displayName: userData.name,
        });

        // Firestore 사용자 문서 생성
        await db.doc(`users/${userRecord.uid}`).set({
          email: userData.email,
          name: userData.name,
          companyId: companyRef.id,
          role: userData.role,
          status: userData.status,
          phone: userData.phone || null,
          requestedDepartment: userData.requestedDepartment || null,
          department: userData.requestedDepartment || null,
          storeId: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`   ✅ 사용자 생성: ${userData.name} (${userData.email}) - ${userData.role}`);
      } catch (userError: any) {
        if (userError.code === "auth/email-already-exists") {
          console.log(`   ⚠️  이미 존재하는 이메일: ${userData.email} - 건너뜀`);
        } else {
          console.error(`   ❌ 사용자 생성 실패: ${userData.email}`, userError.message);
        }
      }
    }

    console.log(`✅ ${companyData.name} 완료!\n`);
  } catch (error: any) {
    console.error(`❌ 회사 생성 실패: ${companyData.name}`, error.message);
  }
}

async function seedTestData() {
  console.log("🌱 테스트 데이터 생성 시작...\n");
  console.log("=".repeat(60));

  for (const company of companies) {
    await createCompanyAndUsers(company);
  }

  console.log("=".repeat(60));
  console.log("\n🎉 테스트 데이터 생성 완료!\n");

  console.log("📊 생성된 데이터 요약:");
  console.log(`   - 회사: ${companies.length}개`);
  console.log(`   - 총 사용자: ${companies.length * 4}명`);
  console.log(`   - 관리자: ${companies.length * 2}명 (OWNER, EXEC/MANAGER)`);
  console.log(`   - 일반 직원: ${companies.length * 2}명 (SALES, STORE)`);

  console.log("\n📋 회사별 초대 코드:");
  companies.forEach((c) => {
    console.log(`   - ${c.name}: ${c.inviteCode}`);
  });

  console.log("\n🔐 모든 계정 비밀번호: test123456\n");
}

// 실행
seedTestData()
  .then(() => {
    console.log("✅ 스크립트 실행 완료");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ 스크립트 실행 실패:", error);
    process.exit(1);
  });
