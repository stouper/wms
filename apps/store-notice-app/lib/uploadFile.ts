// lib/uploadFile.ts
// Firebase Storage에 이미지와 파일을 업로드하는 유틸리티

import { storage } from "../firebaseConfig";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Platform } from "react-native";

export interface UploadResult {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/**
 * 이미지/파일을 Firebase Storage에 업로드하고 다운로드 URL을 반환합니다.
 * @param uri - 업로드할 파일의 로컬 URI
 * @param folder - Storage에 저장할 폴더 경로 (예: "board/images")
 * @param fileName - 저장할 파일명 (확장자 포함)
 * @param onProgress - 업로드 진행률 콜백 (0-100)
 */
export const uploadFile = async (
  uri: string,
  folder: string,
  fileName: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> => {
  try {
    // 1. Blob으로 변환 (React Native 호환)
    const response = await fetch(uri);
    const blob = await response.blob();

    // 파일 정보
    const fileType = blob.type || "application/octet-stream";
    const fileSize = blob.size || 0;

    // 2. Storage Reference 생성
    const storageRef = ref(storage, `${folder}/${fileName}`);

    // 3. 업로드 시작
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: fileType,
    });

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // 진행률 계산
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(Math.round(progress));
          }
          console.log(`Upload progress: ${Math.round(progress)}%`);
        },
        (error) => {
          // 에러 처리
          console.error("Upload error:", error);
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
          reject(error);
        },
        async () => {
          // 업로드 완료
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("Upload completed:", downloadURL);
            resolve({
              url: downloadURL,
              fileName: fileName,
              fileType: fileType,
              fileSize: fileSize,
            });
          } catch (error) {
            console.error("Error getting download URL:", error);
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error("File upload error:", error);
    throw error;
  }
};

/**
 * 여러 파일을 동시에 업로드합니다.
 */
export const uploadMultipleFiles = async (
  files: Array<{ uri: string; fileName: string }>,
  folder: string,
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<UploadResult[]> => {
  const uploadPromises = files.map((file, index) =>
    uploadFile(
      file.uri,
      folder,
      file.fileName,
      (progress) => {
        if (onProgress) {
          onProgress(index, progress);
        }
      }
    )
  );

  return Promise.all(uploadPromises);
};
