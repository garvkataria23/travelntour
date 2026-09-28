/**
 * Google Drive REST API utilities for FlyConnect Agency Backups
 */

export interface GoogleDriveUploadResult {
  success: boolean;
  fileId: string;
  fileName: string;
  webViewLink?: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface GoogleDriveUploadOptions {
  accessToken: string;
  fileName: string;
  fileBlob: Blob;
  mimeType?: string;
  description?: string;
}

/**
 * Uploads a backup file directly to the user's Google Drive via the official Google Drive v3 API.
 */
export async function uploadBackupToGoogleDrive({
  accessToken,
  fileName,
  fileBlob,
  mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  description = "FlyConnect Travel Agency System Complete Backup",
}: GoogleDriveUploadOptions): Promise<GoogleDriveUploadResult> {
  if (!accessToken) {
    throw new Error(
      "Missing Google Drive access token. Please sign in with your Google account to grant upload permission."
    );
  }

  const metadata = {
    name: fileName,
    mimeType: mimeType,
    description: description,
  };

  const boundary = "-------FlyConnectDriveBoundary" + Math.random().toString(36).substring(2);
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  // Build multipart/related body
  const metadataBlob = new Blob(
    [
      delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n`,
    ],
    { type: "text/plain" }
  );

  const closingBlob = new Blob([closeDelimiter], { type: "text/plain" });
  const multipartBody = new Blob([metadataBlob, fileBlob, closingBlob], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink,createdTime",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: multipartBody,
    }
  );

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} (${response.statusText})`;
    try {
      const errJson = await response.json();
      if (errJson.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch {
      // ignore
    }

    if (response.status === 401) {
      throw new Error(
        "Google authentication expired. Please reconnect your Google account to refresh credentials."
      );
    }

    if (response.status === 403) {
      throw new Error(
        `Google Drive permission denied (${errorDetail}). The app requires Drive file creation permissions.`
      );
    }

    throw new Error(`Google Drive upload failed: ${errorDetail}`);
  }

  const result = await response.json();

  return {
    success: true,
    fileId: result.id,
    fileName: result.name || fileName,
    webViewLink:
      result.webViewLink || `https://drive.google.com/file/d/${result.id}/view?usp=sharing`,
    sizeBytes: Number(result.size) || fileBlob.size,
    uploadedAt: result.createdTime || new Date().toISOString(),
  };
}
