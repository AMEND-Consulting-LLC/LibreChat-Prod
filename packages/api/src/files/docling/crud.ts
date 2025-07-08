import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { logger } from '@librechat/data-schemas';
import {
  FileSources,
  envVarRegex,
  extractEnvVariable,
  extractVariableName,
} from 'librechat-data-provider';
import type { TCustomConfig } from 'librechat-data-provider';
import type { AxiosError } from 'axios';
import type {
  DoclingResponse,
  DoclingAsyncResponse,
  DoclingStatusResponse,
  DoclingResultResponse,
  DoclingOCRUploadResult,
  DoclingError,
  DoclingAuthConfig,
} from '~/types';
import { logAxiosError, createAxiosInstance } from '~/utils/axios';

const axios = createAxiosInstance();
const DEFAULT_DOCLING_BASE_URL = 'https://docling.amendllc.com';
const FILE_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB

/** Helper type for OCR request context */
interface OCRContext {
  req: {
    user?: { id: string };
    app: {
      locals?: {
        ocr?: TCustomConfig['ocr'];
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

/**
 * Determines if a value needs to be loaded from environment
 */
function needsEnvLoad(value: string): boolean {
  return envVarRegex.test(value) || !value.trim();
}

/**
 * Gets the environment variable name for a config value
 */
function getEnvVarName(configValue: string, defaultName: string): string {
  if (!envVarRegex.test(configValue)) {
    return defaultName;
  }
  return extractVariableName(configValue) || defaultName;
}

/**
 * Resolves a configuration value from either hardcoded or environment
 */
async function resolveConfigValue(
  configValue: string,
  defaultEnvName: string,
  authValues: Record<string, string | undefined>,
  defaultValue?: string,
): Promise<string> {
  // If it's a hardcoded value (not env var and not empty), use it directly
  if (!needsEnvLoad(configValue)) {
    return configValue;
  }

  // Otherwise, get from auth values
  const envVarName = getEnvVarName(configValue, defaultEnvName);
  return authValues[envVarName] || defaultValue || '';
}

/**
 * Loads authentication configuration from OCR config
 */
export async function loadDoclingAuthConfig(context: OCRContext): Promise<DoclingAuthConfig> {
  const ocrConfig = context.req.app.locals?.ocr;
  const apiKeyConfig = ocrConfig?.apiKey || '';
  const baseURLConfig = ocrConfig?.baseURL || '';

  if (!needsEnvLoad(apiKeyConfig) && !needsEnvLoad(baseURLConfig)) {
    return {
      apiKey: apiKeyConfig,
      baseURL: baseURLConfig || DEFAULT_DOCLING_BASE_URL,
    };
  }

  const authFields: string[] = [];

  if (needsEnvLoad(baseURLConfig)) {
    authFields.push(getEnvVarName(baseURLConfig, 'DOCLING_BASE_URL'));
  }

  if (needsEnvLoad(apiKeyConfig)) {
    authFields.push(getEnvVarName(apiKeyConfig, 'DOCLING_API_KEY'));
  }

  const authValues = await context.loadAuthValues({
    userId: context.req.user?.id || '',
    authFields,
    optional: new Set(['DOCLING_BASE_URL']),
  });

  const apiKey = await resolveConfigValue(apiKeyConfig, 'DOCLING_API_KEY', authValues);
  const baseURL = await resolveConfigValue(
    baseURLConfig,
    'DOCLING_BASE_URL',
    authValues,
    DEFAULT_DOCLING_BASE_URL,
  );

  return { apiKey, baseURL };
}

/**
 * Determines which endpoint to use based on file size
 */
export function determineEndpoint(fileSize: number, baseURL: string): string {
  const isAsync = fileSize >= FILE_SIZE_THRESHOLD;
  const endpoint = isAsync ? '/v1alpha/convert/file/async' : '/v1alpha/convert/file';
  return `${baseURL}${endpoint}`;
}

/**
 * Gets the OCR configuration parameters
 */
function getOCRConfig(ocrConfig: TCustomConfig['ocr']) {
  return {
    do_ocr: ocrConfig?.doOcr ?? true,
    force_ocr: ocrConfig?.forceOcr ?? false,
    ocr_engine: ocrConfig?.ocrEngine || 'easyocr',
    ocr_lang: ocrConfig?.ocrLang || 'en',
    output_format: ocrConfig?.outputFormat || 'markdown',
    generate_page_images: false,
    generate_table_images: false,
    generate_picture_images: false,
  };
}

/**
 * Performs OCR using Docling API
 */
export async function performDoclingOCR({
  filePath,
  fileName,
  fileSize,
  apiKey,
  baseURL,
  ocrConfig,
}: {
  filePath: string;
  fileName: string;
  fileSize: number;
  apiKey: string;
  baseURL: string;
  ocrConfig: TCustomConfig['ocr'];
}): Promise<DoclingResponse> {
  const endpoint = determineEndpoint(fileSize, baseURL);
  const isAsync = fileSize >= FILE_SIZE_THRESHOLD;
  
  const form = new FormData();
  const fileStream = fs.createReadStream(filePath);
  form.append('files', fileStream, { filename: fileName });

  // Add OCR configuration parameters
  const config = getOCRConfig(ocrConfig);
  Object.entries(config).forEach(([key, value]) => {
    form.append(key, String(value));
  });

  try {
    const response = await axios.post(endpoint, form, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    if (isAsync) {
      // Handle async response
      const asyncResponse: DoclingAsyncResponse = response.data;
      return await pollForResult(asyncResponse.task_id, apiKey, baseURL);
    } else {
      // Handle sync response
      return response.data as DoclingResponse;
    }
  } catch (error) {
    logger.error('Error performing Docling OCR:', error);
    throw error;
  }
}

/**
 * Polls for async OCR result
 */
async function pollForResult(
  taskId: string,
  apiKey: string,
  baseURL: string,
  maxAttempts: number = 60,
  intervalMs: number = 5000,
): Promise<DoclingResponse> {
  const statusUrl = `${baseURL}/v1alpha/status/poll/${taskId}`;
  const resultUrl = `${baseURL}/v1alpha/result/${taskId}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const statusResponse = await axios.get(statusUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const status: DoclingStatusResponse = statusResponse.data;

      if (status.status === 'completed') {
        // Get the result
        const resultResponse = await axios.get(resultUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        const result: DoclingResultResponse = resultResponse.data;
        return result.result;
      } else if (status.status === 'failed') {
        throw new Error(`OCR processing failed: ${status.message || 'Unknown error'}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      logger.warn(`Polling attempt ${attempt + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error('OCR processing timed out');
}

/**
 * Processes Docling result to extract text content
 */
export function processDoclingResult(doclingResult: DoclingResponse): { text: string; images: string[] } {
  const outputFormat: 'markdown' | 'html' | 'text' | 'json' = 'markdown';
  let text = '';

  if (outputFormat === 'markdown') {
    text = doclingResult.document.md_content || '';
  } else if (outputFormat === 'html') {
    text = doclingResult.document.html_content || '';
  } else if (outputFormat === 'text') {
    text = doclingResult.document.text_content || '';
  } else if (outputFormat === 'json') {
    text = JSON.stringify(doclingResult.document.json_content, null, 2) || '';
  } else {
    text = doclingResult.document.md_content || doclingResult.document.text_content || '';
  }

  // Docling doesn't return images in the same way as Mistral, so return empty array
  const images: string[] = [];

  return { text, images };
}

/**
 * Creates an error message for OCR operations
 */
function createOCRError(error: unknown, baseMessage: string): Error {
  const axiosError = error as AxiosError<DoclingError>;
  const detail = axiosError?.response?.data?.detail;
  const message = detail || baseMessage;

  const responseMessage = axiosError?.response?.data?.message;
  const errorLog = logAxiosError({ error: axiosError, message });
  const fullMessage = responseMessage ? `${errorLog} - ${responseMessage}` : errorLog;

  return new Error(fullMessage);
}

/**
 * Uploads a file to the Docling OCR API and processes the OCR result.
 *
 * @param context - The OCR context object containing request, file, and auth loading function
 * @returns The result object containing the processed text and metadata
 */
export const uploadDoclingOCR = async (context: OCRContext): Promise<DoclingOCRUploadResult> => {
  try {
    const { apiKey, baseURL } = await loadDoclingAuthConfig(context);
    const ocrConfig = context.req.app.locals?.ocr;

    if (!apiKey) {
      throw new Error('Docling API key is required');
    }

    const doclingResult = await performDoclingOCR({
      filePath: context.file.path,
      fileName: context.file.originalname,
      fileSize: context.file.size,
      apiKey,
      baseURL,
      ocrConfig,
    });

    if (!doclingResult || !doclingResult.document) {
      throw new Error(
        'No OCR result returned from Docling service, may be down or the file is not supported.',
      );
    }

    const { text, images } = processDoclingResult(doclingResult);

    return {
      filename: context.file.originalname,
      bytes: text.length * 4,
      filepath: FileSources.docling_ocr,
      text,
      images,
    };
  } catch (error) {
    throw createOCRError(error, 'Error uploading document to Docling OCR API:');
  }
};