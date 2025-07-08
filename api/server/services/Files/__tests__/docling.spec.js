const { FileSources } = require('librechat-data-provider');
const { uploadDoclingOCR } = require('@librechat/api');
const { getStrategyFunctions } = require('../strategies');

// Mock the uploadDoclingOCR function
jest.mock('@librechat/api', () => ({
  uploadDoclingOCR: jest.fn(),
}));

describe('Docling OCR Strategy Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStrategyFunctions', () => {
    it('should return doclingOCRStrategy for docling_ocr FileSources', () => {
      const strategy = getStrategyFunctions(FileSources.docling_ocr);

      expect(strategy).toBeDefined();
      expect(strategy.handleFileUpload).toBe(uploadDoclingOCR);
      expect(strategy.saveURL).toBeNull();
      expect(strategy.getFileURL).toBeNull();
      expect(strategy.saveBuffer).toBeNull();
      expect(strategy.processAvatar).toBeNull();
      expect(strategy.handleImageUpload).toBeNull();
      expect(strategy.prepareImagePayload).toBeNull();
      expect(strategy.deleteFile).toBeNull();
      expect(strategy.getDownloadStream).toBeNull();
    });

    it('should throw error for invalid file source', () => {
      expect(() => {
        getStrategyFunctions('invalid_source');
      }).toThrow('Invalid file source');
    });

    it('should return different strategies for other file sources', () => {
      const localStrategy = getStrategyFunctions(FileSources.local);
      const s3Strategy = getStrategyFunctions(FileSources.s3);
      const mistralStrategy = getStrategyFunctions(FileSources.mistral_ocr);

      expect(localStrategy.handleFileUpload).not.toBe(uploadDoclingOCR);
      expect(s3Strategy.handleFileUpload).not.toBe(uploadDoclingOCR);
      expect(mistralStrategy.handleFileUpload).not.toBe(uploadDoclingOCR);
    });
  });

  describe('doclingOCRStrategy function', () => {
    let strategy;

    beforeEach(() => {
      strategy = getStrategyFunctions(FileSources.docling_ocr);
    });

    it('should have correct structure for OCR-only strategy', () => {
      expect(strategy).toEqual({
        saveURL: null,
        getFileURL: null,
        saveBuffer: null,
        processAvatar: null,
        handleImageUpload: null,
        prepareImagePayload: null,
        deleteFile: null,
        getDownloadStream: null,
        handleFileUpload: uploadDoclingOCR,
      });
    });

    it('should call uploadDoclingOCR when handleFileUpload is invoked', async () => {
      const mockContext = {
        req: {
          user: { id: 'test-user' },
          app: {
            locals: {
              ocr: {
                apiKey: 'test-key',
                baseURL: 'https://test.docling.com',
              },
            },
          },
        },
        file: {
          path: '/tmp/test.pdf',
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 1024,
        },
        loadAuthValues: jest.fn(),
      };

      const mockResult = {
        filename: 'test.pdf',
        bytes: 1024,
        filepath: FileSources.docling_ocr,
        text: 'Extracted text content',
        images: [],
      };

      uploadDoclingOCR.mockResolvedValue(mockResult);

      const result = await strategy.handleFileUpload(mockContext);

      expect(uploadDoclingOCR).toHaveBeenCalledWith(mockContext);
      expect(result).toEqual(mockResult);
    });

    it('should propagate errors from uploadDoclingOCR', async () => {
      const mockContext = {
        req: { user: { id: 'test-user' } },
        file: { path: '/tmp/test.pdf' },
        loadAuthValues: jest.fn(),
      };

      const mockError = new Error('OCR processing failed');
      uploadDoclingOCR.mockRejectedValue(mockError);

      await expect(strategy.handleFileUpload(mockContext)).rejects.toThrow('OCR processing failed');
      expect(uploadDoclingOCR).toHaveBeenCalledWith(mockContext);
    });
  });

  describe('Integration with file processing workflow', () => {
    it('should integrate with LibreChat file processing system', () => {
      // Test that the strategy is properly integrated into the file processing workflow
      const doclingStrategy = getStrategyFunctions(FileSources.docling_ocr);
      
      // Verify that only the necessary functions are available for OCR processing
      expect(doclingStrategy.handleFileUpload).toBeDefined();
      expect(typeof doclingStrategy.handleFileUpload).toBe('function');
      
      // Verify that file storage functions are not available (OCR only)
      expect(doclingStrategy.saveURL).toBeNull();
      expect(doclingStrategy.getFileURL).toBeNull();
      expect(doclingStrategy.saveBuffer).toBeNull();
      expect(doclingStrategy.deleteFile).toBeNull();
      
      // Verify that image processing functions are not available
      expect(doclingStrategy.handleImageUpload).toBeNull();
      expect(doclingStrategy.prepareImagePayload).toBeNull();
      expect(doclingStrategy.processAvatar).toBeNull();
      
      // Verify that download stream is not available
      expect(doclingStrategy.getDownloadStream).toBeNull();
    });

    it('should handle different file sources correctly', () => {
      const testCases = [
        { source: FileSources.local, expectDocling: false },
        { source: FileSources.s3, expectDocling: false },
        { source: FileSources.firebase, expectDocling: false },
        { source: FileSources.azure_blob, expectDocling: false },
        { source: FileSources.openai, expectDocling: false },
        { source: FileSources.vectordb, expectDocling: false },
        { source: FileSources.execute_code, expectDocling: false },
        { source: FileSources.mistral_ocr, expectDocling: false },
        { source: FileSources.azure_mistral_ocr, expectDocling: false },
        { source: FileSources.vertexai_mistral_ocr, expectDocling: false },
        { source: FileSources.docling_ocr, expectDocling: true },
      ];

      testCases.forEach(({ source, expectDocling }) => {
        const strategy = getStrategyFunctions(source);
        
        if (expectDocling) {
          expect(strategy.handleFileUpload).toBe(uploadDoclingOCR);
        } else {
          expect(strategy.handleFileUpload).not.toBe(uploadDoclingOCR);
        }
      });
    });
  });

  describe('Configuration loading in server context', () => {
    it('should work with server-side configuration structure', async () => {
      const serverContext = {
        req: {
          user: { id: 'server-user' },
          app: {
            locals: {
              ocr: {
                apiKey: '${DOCLING_API_KEY}',
                baseURL: '${DOCLING_BASE_URL}',
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
          path: '/uploads/document.pdf',
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
          size: 2048,
        },
        loadAuthValues: jest.fn().mockResolvedValue({
          DOCLING_API_KEY: 'server-api-key',
          DOCLING_BASE_URL: 'https://server.docling.com',
        }),
      };

      const mockResult = {
        filename: 'document.pdf',
        bytes: 2048,
        filepath: FileSources.docling_ocr,
        text: 'Server processed content',
        images: [],
      };

      uploadDoclingOCR.mockResolvedValue(mockResult);

      const strategy = getStrategyFunctions(FileSources.docling_ocr);
      const result = await strategy.handleFileUpload(serverContext);

      expect(uploadDoclingOCR).toHaveBeenCalledWith(serverContext);
      expect(result).toEqual(mockResult);
      expect(serverContext.loadAuthValues).toHaveBeenCalledWith({
        userId: 'server-user',
        authFields: ['DOCLING_BASE_URL', 'DOCLING_API_KEY'],
        optional: new Set(['DOCLING_BASE_URL']),
      });
    });

    it('should handle missing server configuration gracefully', async () => {
      const minimalContext = {
        req: {
          user: { id: 'minimal-user' },
          app: {
            locals: {}, // No OCR config
          },
        },
        file: {
          path: '/tmp/minimal.pdf',
          originalname: 'minimal.pdf',
          mimetype: 'application/pdf',
          size: 512,
        },
        loadAuthValues: jest.fn().mockResolvedValue({}),
      };

      const mockError = new Error('Docling API key is required');
      uploadDoclingOCR.mockRejectedValue(mockError);

      const strategy = getStrategyFunctions(FileSources.docling_ocr);
      
      await expect(strategy.handleFileUpload(minimalContext)).rejects.toThrow('Docling API key is required');
      expect(uploadDoclingOCR).toHaveBeenCalledWith(minimalContext);
    });
  });

  describe('Error handling in strategy context', () => {
    let strategy;

    beforeEach(() => {
      strategy = getStrategyFunctions(FileSources.docling_ocr);
    });

    it('should handle authentication errors', async () => {
      const context = {
        req: { user: { id: 'auth-test' } },
        file: { path: '/tmp/auth-test.pdf' },
        loadAuthValues: jest.fn(),
      };

      const authError = new Error('Authentication failed: Invalid API key');
      uploadDoclingOCR.mockRejectedValue(authError);

      await expect(strategy.handleFileUpload(context)).rejects.toThrow('Authentication failed: Invalid API key');
    });

    it('should handle network errors', async () => {
      const context = {
        req: { user: { id: 'network-test' } },
        file: { path: '/tmp/network-test.pdf' },
        loadAuthValues: jest.fn(),
      };

      const networkError = new Error('Network error: ECONNREFUSED');
      uploadDoclingOCR.mockRejectedValue(networkError);

      await expect(strategy.handleFileUpload(context)).rejects.toThrow('Network error: ECONNREFUSED');
    });

    it('should handle file processing errors', async () => {
      const context = {
        req: { user: { id: 'processing-test' } },
        file: { path: '/tmp/invalid-file.txt' },
        loadAuthValues: jest.fn(),
      };

      const processingError = new Error('Unsupported file format');
      uploadDoclingOCR.mockRejectedValue(processingError);

      await expect(strategy.handleFileUpload(context)).rejects.toThrow('Unsupported file format');
    });
  });
});