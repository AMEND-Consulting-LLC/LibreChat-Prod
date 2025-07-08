/**
 * Docling OCR API Types
 * Based on Docling API specification
 */

export interface DoclingFileUploadRequest {
  files: File[];
  do_ocr?: boolean;
  force_ocr?: boolean;
  ocr_engine?: string;
  ocr_lang?: string;
  output_format?: 'markdown' | 'json' | 'html' | 'text';
  generate_page_images?: boolean;
  generate_table_images?: boolean;
  generate_picture_images?: boolean;
}

export interface DoclingDocument {
  filename: string;
  md_content: string;
  json_content: Record<string, any>;
  html_content: string;
  text_content: string;
}

export interface DoclingResponse {
  document: DoclingDocument;
  status: 'pending' | 'completed' | 'failed';
  errors: string[];
  processing_time: number;
}

export interface DoclingAsyncResponse {
  task_id: string;
  status: 'pending' | 'completed' | 'failed';
  message?: string;
}

export interface DoclingStatusResponse {
  task_id: string;
  status: 'pending' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

export interface DoclingResultResponse {
  task_id: string;
  result: DoclingResponse;
  status: 'completed' | 'failed';
}

export interface DoclingError {
  detail?: string;
  message?: string;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export interface DoclingOCRUploadResult {
  filename: string;
  bytes: number;
  filepath: string;
  text: string;
  images?: string[];
}

export interface DoclingAuthConfig {
  apiKey: string;
  baseURL: string;
}

export interface DoclingOCRContext {
  req: {
    user?: { id: string };
    app: {
      locals?: {
        ocr?: {
          apiKey?: string;
          baseURL?: string;
          doclingModel?: string;
          outputFormat?: string;
          doOcr?: boolean;
          forceOcr?: boolean;
          ocrEngine?: string;
          ocrLang?: string;
        };
      };
    };
  };
  file: {
    path: string;
    originalname: string;
    mimetype: string;
    size: number;
  };
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
    optional?: Set<string>;
  }) => Promise<Record<string, string | undefined>>;
}