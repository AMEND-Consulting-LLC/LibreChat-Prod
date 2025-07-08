import * as fs from 'fs';
import FormData from 'form-data';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { AxiosError } from 'axios';
import {
  uploadDoclingOCR,
  loadDoclingAuthConfig,
  performDoclingOCR,
  determineEndpoint,
  processDoclingResult,
} from './crud';
import type {
  DoclingResponse,
  DoclingAsyncResponse,
  DoclingStatusResponse,
  DoclingResultResponse,
  DoclingError,
} from '~/types';
import { createAxiosInstance } from '~/utils/axios';

// Mock dependencies
jest.mock('fs');
jest.mock('form-data');
jest.mock('@librechat/data-schemas');
jest.mock('~/utils/axios');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockFormData = FormData as jest.MockedClass<typeof FormData>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockCreateAxiosInstance = createAxiosInstance as jest.MockedFunction<typeof createAxiosInstance>;

describe('Docling OCR', () => {
  let mockAxios: any;
  let mockContext: any;
  let mockFormInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock axios instance
    mockAxios = {
      post: jest.fn(),
      get: jest.fn(),
    };
    mockCreateAxiosInstance.mockReturnValue(mockAxios);

    // Mock FormData instance
    mockFormInstance = {
      append: jest.fn(),
      getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' }),
    };
    mockFormData.mockImplementation(() => mockFormInstance);

    // Mock fs.createReadStream
    mockFs.createReadStream.mockReturnValue('mock-file-stream' as any);

    // Mock context
    mockContext = {
      req: {
        user: { id: 'test-user-id' },
        app: {
          locals: {
            ocr: {
              apiKey: 'test-api-key',
              baseURL: 'https://test.docling.com',
              doOcr: true,
              forceOcr: false,
              ocrEngine: 'easyocr',
              ocrLang: 'en',
              outputFormat: 'markdown',
            },
          },
        },
      },
      file: {
        path: '/tmp/test-file.pdf',
        originalname: 'test-file.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 1024, // 1MB
      },
      loadAuthValues: jest.fn(),
    };
  });

  describe('loadDoclingAuthConfig', () => {
    it('should return hardcoded values when no env vars needed', async () => {
      const result = await loadDoclingAuthConfig(mockContext);

      expect(result).toEqual({
        apiKey: 'test-api-key',
        baseURL: 'https://test.docling.com',
      });
      expect(mockContext.loadAuthValues).not.toHaveBeenCalled();
    });

    it('should load from auth values when env vars are needed', async () => {
      mockContext.req.app.locals.ocr.apiKey = '${DOCLING_API_KEY}';
      mockContext.req.app.locals.ocr.baseURL = '${DOCLING_BASE_URL}';
      mockContext.loadAuthValues.mockResolvedValue({
        DOCLING_API_KEY: 'env-api-key',
        DOCLING_BASE_URL: 'https://env.docling.com',
      });

      const result = await loadDoclingAuthConfig(mockContext);

      expect(result).toEqual({
        apiKey: 'env-api-key',
        baseURL: 'https://env.docling.com',
      });
      expect(mockContext.loadAuthValues).toHaveBeenCalledWith({
        userId: 'test-user-id',
        authFields: ['DOCLING_BASE_URL', 'DOCLING_API_KEY'],
        optional: new Set(['DOCLING_BASE_URL']),
      });
    });

    it('should use default base URL when not provided', async () => {
      mockContext.req.app.locals.ocr.baseURL = '';
      mockContext.loadAuthValues.mockResolvedValue({});

      const result = await loadDoclingAuthConfig(mockContext);

      expect(result.baseURL).toBe('https://docling.amendllc.com');
    });

    it('should handle empty apiKey config', async () => {
      mockContext.req.app.locals.ocr.apiKey = '';
      mockContext.loadAuthValues.mockResolvedValue({
        DOCLING_API_KEY: 'loaded-key',
      });

      const result = await loadDoclingAuthConfig(mockContext);

      expect(result.apiKey).toBe('loaded-key');
    });
  });

  describe('determineEndpoint', () => {
    const baseURL = 'https://test.docling.com';

    it('should return sync endpoint for small files', () => {
      const fileSize = 3 * 1024 * 1024; // 3MB
      const result = determineEndpoint(fileSize, baseURL);
      expect(result).toBe('https://test.docling.com/v1alpha/convert/file');
    });

    it('should return async endpoint for large files', () => {
      const fileSize = 6 * 1024 * 1024; // 6MB
      const result = determineEndpoint(fileSize, baseURL);
      expect(result).toBe('https://test.docling.com/v1alpha/convert/file/async');
    });

    it('should return async endpoint for files exactly at threshold', () => {
      const fileSize = 5 * 1024 * 1024; // 5MB
      const result = determineEndpoint(fileSize, baseURL);
      expect(result).toBe('https://test.docling.com/v1alpha/convert/file/async');
    });
  });

  describe('performDoclingOCR', () => {
    const mockParams = {
      filePath: '/tmp/test.pdf',
      fileName: 'test.pdf',
      fileSize: 1024 * 1024, // 1MB
      apiKey: 'test-key',
      baseURL: 'https://test.docling.com',
      ocrConfig: {
        doOcr: true,
        forceOcr: false,
        ocrEngine: 'easyocr',
        ocrLang: 'en',
        outputFormat: 'markdown',
      },
    };

    it('should process small files using sync endpoint', async () => {
      const mockResponse: DoclingResponse = {
        document: {
          filename: 'test.pdf',
          md_content: '# Test Content',
          json_content: {},
          html_content: '<h1>Test Content</h1>',
          text_content: 'Test Content',
        },
        status: 'completed',
        errors: [],
        processing_time: 1.5,
      };

      mockAxios.post.mockResolvedValue({ data: mockResponse });

      const result = await performDoclingOCR(mockParams);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://test.docling.com/v1alpha/convert/file',
        mockFormInstance,
        {
          headers: {
            Authorization: 'Bearer test-key',
            'content-type': 'multipart/form-data',
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      expect(mockFormInstance.append).toHaveBeenCalledWith('files', 'mock-file-stream', { filename: 'test.pdf' });
      expect(mockFormInstance.append).toHaveBeenCalledWith('do_ocr', 'true');
      expect(mockFormInstance.append).toHaveBeenCalledWith('force_ocr', 'false');
      expect(mockFormInstance.append).toHaveBeenCalledWith('ocr_engine', 'easyocr');
      expect(mockFormInstance.append).toHaveBeenCalledWith('ocr_lang', 'en');
      expect(mockFormInstance.append).toHaveBeenCalledWith('output_format', 'markdown');
      expect(result).toEqual(mockResponse);
    });

    it('should process large files using async endpoint with polling', async () => {
      const largeFileParams = { ...mockParams, fileSize: 6 * 1024 * 1024 }; // 6MB
      
      const mockAsyncResponse: DoclingAsyncResponse = {
        task_id: 'task-123',
        status: 'pending',
      };

      const mockStatusResponse: DoclingStatusResponse = {
        task_id: 'task-123',
        status: 'completed',
      };

      const mockResultResponse: DoclingResultResponse = {
        task_id: 'task-123',
        status: 'completed',
        result: {
          document: {
            filename: 'test.pdf',
            md_content: '# Large File Content',
            json_content: {},
            html_content: '<h1>Large File Content</h1>',
            text_content: 'Large File Content',
          },
          status: 'completed',
          errors: [],
          processing_time: 5.2,
        },
      };

      mockAxios.post.mockResolvedValue({ data: mockAsyncResponse });
      mockAxios.get
        .mockResolvedValueOnce({ data: mockStatusResponse })
        .mockResolvedValueOnce({ data: mockResultResponse });

      const result = await performDoclingOCR(largeFileParams);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://test.docling.com/v1alpha/convert/file/async',
        mockFormInstance,
        expect.any(Object)
      );
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://test.docling.com/v1alpha/status/poll/task-123',
        { headers: { Authorization: 'Bearer test-key' } }
      );
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://test.docling.com/v1alpha/result/task-123',
        { headers: { Authorization: 'Bearer test-key' } }
      );
      expect(result).toEqual(mockResultResponse.result);
    });

    it('should handle async polling with multiple status checks', async () => {
      const largeFileParams = { ...mockParams, fileSize: 6 * 1024 * 1024 };
      
      const mockAsyncResponse: DoclingAsyncResponse = {
        task_id: 'task-456',
        status: 'pending',
      };

      const mockPendingStatus: DoclingStatusResponse = {
        task_id: 'task-456',
        status: 'pending',
        progress: 50,
      };

      const mockCompletedStatus: DoclingStatusResponse = {
        task_id: 'task-456',
        status: 'completed',
      };

      const mockResultResponse: DoclingResultResponse = {
        task_id: 'task-456',
        status: 'completed',
        result: {
          document: {
            filename: 'test.pdf',
            md_content: '# Processed Content',
            json_content: {},
            html_content: '<h1>Processed Content</h1>',
            text_content: 'Processed Content',
          },
          status: 'completed',
          errors: [],
          processing_time: 3.1,
        },
      };

      mockAxios.post.mockResolvedValue({ data: mockAsyncResponse });
      mockAxios.get
        .mockResolvedValueOnce({ data: mockPendingStatus })
        .mockResolvedValueOnce({ data: mockCompletedStatus })
        .mockResolvedValueOnce({ data: mockResultResponse });

      // Mock setTimeout to resolve immediately
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      const result = await performDoclingOCR(largeFileParams);

      expect(mockAxios.get).toHaveBeenCalledTimes(3); // 2 status checks + 1 result fetch
      expect(result).toEqual(mockResultResponse.result);

      jest.restoreAllMocks();
    });

    it('should handle async processing failure', async () => {
      const largeFileParams = { ...mockParams, fileSize: 6 * 1024 * 1024 };
      
      const mockAsyncResponse: DoclingAsyncResponse = {
        task_id: 'task-failed',
        status: 'pending',
      };

      const mockFailedStatus: DoclingStatusResponse = {
        task_id: 'task-failed',
        status: 'failed',
        message: 'Processing failed due to invalid file format',
      };

      mockAxios.post.mockResolvedValue({ data: mockAsyncResponse });
      mockAxios.get.mockResolvedValue({ data: mockFailedStatus });

      await expect(performDoclingOCR(largeFileParams)).rejects.toThrow(
        'OCR processing failed: Processing failed due to invalid file format'
      );
    });

    it('should handle async processing timeout', async () => {
      const largeFileParams = { ...mockParams, fileSize: 6 * 1024 * 1024 };
      
      const mockAsyncResponse: DoclingAsyncResponse = {
        task_id: 'task-timeout',
        status: 'pending',
      };

      const mockPendingStatus: DoclingStatusResponse = {
        task_id: 'task-timeout',
        status: 'pending',
      };

      mockAxios.post.mockResolvedValue({ data: mockAsyncResponse });
      mockAxios.get.mockResolvedValue({ data: mockPendingStatus });

      // Mock setTimeout to resolve immediately to simulate timeout
      jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        callback();
        return {} as any;
      });

      await expect(performDoclingOCR(largeFileParams)).rejects.toThrow('OCR processing timed out');

      jest.restoreAllMocks();
    });

    it('should handle API errors', async () => {
      const mockError = new Error('Network error') as AxiosError;
      mockAxios.post.mockRejectedValue(mockError);

      await expect(performDoclingOCR(mockParams)).rejects.toThrow('Network error');
      expect(mockLogger.error).toHaveBeenCalledWith('Error performing Docling OCR:', mockError);
    });
  });

  describe('processDoclingResult', () => {
    const mockDoclingResult: DoclingResponse = {
      document: {
        filename: 'test.pdf',
        md_content: '# Test Markdown Content',
        json_content: { title: 'Test', content: 'JSON content' },
        html_content: '<h1>Test HTML Content</h1>',
        text_content: 'Test Text Content',
      },
      status: 'completed',
      errors: [],
      processing_time: 2.1,
    };

    it('should extract markdown content by default', () => {
      const result = processDoclingResult(mockDoclingResult);

      expect(result).toEqual({
        text: '# Test Markdown Content',
        images: [],
      });
    });

    it('should handle missing markdown content', () => {
      const resultWithoutMd = {
        ...mockDoclingResult,
        document: {
          ...mockDoclingResult.document,
          md_content: '',
          text_content: 'Fallback text content',
        },
      };

      const result = processDoclingResult(resultWithoutMd);

      expect(result).toEqual({
        text: 'Fallback text content',
        images: [],
      });
    });

    it('should handle completely empty content', () => {
      const emptyResult = {
        ...mockDoclingResult,
        document: {
          ...mockDoclingResult.document,
          md_content: '',
          html_content: '',
          text_content: '',
          json_content: {},
        },
      };

      const result = processDoclingResult(emptyResult);

      expect(result).toEqual({
        text: '',
        images: [],
      });
    });
  });

  describe('uploadDoclingOCR', () => {
    it('should successfully upload and process a document', async () => {
      const mockDoclingResult: DoclingResponse = {
        document: {
          filename: 'test.pdf',
          md_content: '# Uploaded Document Content',
          json_content: {},
          html_content: '<h1>Uploaded Document Content</h1>',
          text_content: 'Uploaded Document Content',
        },
        status: 'completed',
        errors: [],
        processing_time: 1.8,
      };

      mockAxios.post.mockResolvedValue({ data: mockDoclingResult });

      const result = await uploadDoclingOCR(mockContext);

      expect(result).toEqual({
        filename: 'test-file.pdf',
        bytes: 104, // '# Uploaded Document Content'.length * 4
        filepath: FileSources.docling_ocr,
        text: '# Uploaded Document Content',
        images: [],
      });
    });

    it('should throw error when API key is missing', async () => {
      mockContext.req.app.locals.ocr.apiKey = '';
      mockContext.loadAuthValues.mockResolvedValue({});

      await expect(uploadDoclingOCR(mockContext)).rejects.toThrow('Docling API key is required');
    });

    it('should throw error when no OCR result is returned', async () => {
      mockAxios.post.mockResolvedValue({ data: null });

      await expect(uploadDoclingOCR(mockContext)).rejects.toThrow(
        'No OCR result returned from Docling service, may be down or the file is not supported.'
      );
    });

    it('should throw error when document is missing from result', async () => {
      mockAxios.post.mockResolvedValue({ data: { status: 'completed' } });

      await expect(uploadDoclingOCR(mockContext)).rejects.toThrow(
        'No OCR result returned from Docling service, may be down or the file is not supported.'
      );
    });

    it('should handle authentication errors', async () => {
      const authError = {
        response: {
          status: 401,
          data: {
            detail: 'Invalid API key',
            message: 'Authentication failed',
          },
        },
      } as AxiosError<DoclingError>;

      mockAxios.post.mockRejectedValue(authError);

      await expect(uploadDoclingOCR(mockContext)).rejects.toThrow();
    });

    it('should handle API timeout errors', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 30000ms exceeded',
      } as AxiosError;

      mockAxios.post.mockRejectedValue(timeoutError);

      await expect(uploadDoclingOCR(mockContext)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const networkError = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND docling.amendllc.com',
      } as AxiosError;

      mockAxios.post.mockRejectedValue(networkError);

      await expect(uploadDoclingOCR(mockContext)).rejects.toThrow();
    });

    it('should handle invalid file format errors', async () => {
      const formatError = {
        response: {
          status: 400,
          data: {
            detail: 'Unsupported file format',
            message: 'File format not supported for OCR processing',
          },
        },
      } as AxiosError<DoclingError>;

      mockAxios.post.mockRejectedValue(formatError);

      await expect(uploadDoclingOCR(mockContext)).rejects.toThrow();
    });
  });

  describe('Configuration edge cases', () => {
    it('should handle missing OCR config', async () => {
      mockContext.req.app.locals = {};

      const result = await loadDoclingAuthConfig(mockContext);

      expect(result.baseURL).toBe('https://docling.amendllc.com');
      expect(result.apiKey).toBe('');
    });

    it('should handle partial OCR config', async () => {
      mockContext.req.app.locals.ocr = {
        apiKey: 'partial-key',
        // baseURL missing
      };

      const result = await loadDoclingAuthConfig(mockContext);

      expect(result.apiKey).toBe('partial-key');
      expect(result.baseURL).toBe('https://docling.amendllc.com');
    });

    it('should handle user without ID', async () => {
      mockContext.req.user = undefined;
      mockContext.req.app.locals.ocr.apiKey = '${DOCLING_API_KEY}';
      mockContext.loadAuthValues.mockResolvedValue({
        DOCLING_API_KEY: 'loaded-key',
      });

      const result = await loadDoclingAuthConfig(mockContext);

      expect(mockContext.loadAuthValues).toHaveBeenCalledWith({
        userId: '',
        authFields: ['DOCLING_API_KEY'],
        optional: new Set(['DOCLING_BASE_URL']),
      });
      expect(result.apiKey).toBe('loaded-key');
    });
  });
});