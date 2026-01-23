import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  onModuleInit() {
    if (admin.apps.length === 0) {
      // 환경변수에서 서비스 계정 정보 로드
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

      if (serviceAccount) {
        try {
          const parsed = JSON.parse(serviceAccount);
          admin.initializeApp({
            credential: admin.credential.cert(parsed),
          });
          this.logger.log('Firebase Admin initialized with service account');
        } catch (e) {
          this.logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT', e);
          throw e;
        }
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // 파일 경로로 초기화
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
        this.logger.log('Firebase Admin initialized with application default credentials');
      } else {
        this.logger.warn('Firebase credentials not found. Firebase features will not work.');
      }
    }
  }

  // idToken 검증 → Firebase UID 반환
  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken | null> {
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      return decoded;
    } catch (error: any) {
      this.logger.warn(`idToken verification failed: ${error?.message || error}`);
      return null;
    }
  }

  // Firebase UID로 사용자 정보 조회
  async getUser(uid: string): Promise<admin.auth.UserRecord | null> {
    try {
      return await admin.auth().getUser(uid);
    } catch (error: any) {
      this.logger.warn(`getUser failed: ${error?.message || error}`);
      return null;
    }
  }
}
