import { loadDoclingOCRConfig } from '../ocr';

describe('Docling OCR Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear relevant environment variables
    delete process.env.DOCLING_API_KEY;
    delete process.env.DOCLING_BASE_URL;
    delete process.env.DOCLING_SYNC_THRESHOLD_MB;
    delete process.env.DOCLING_DO_OCR;
    delete process.env.DOCLING_FORCE_OCR;
    delete process.env.DOCLING_OCR_ENGINE;
    delete process.env.DOCLING_OCR_LANG;
    delete process.env.DOCLING_OUTPUT_FORMAT;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadDoclingOCRConfig', () => {
    it('should return default values when no config is provided', () => {
      const result = loadDoclingOCRConfig(undefined);

      expect(result).toEqual({
        apiKey: '',
        baseURL: 'https://docling.amendllc.com',
        syncThresholdMB: 5,
        do_ocr: true,
        force_ocr: false,
        ocr_engine: 'easyocr',
        ocr_lang: 'en',
        output_format: 'md',
      });
    });

    it('should return default values when empty config is provided', () => {
      const config = {} as any;
      const result = loadDoclingOCRConfig(config);

      expect(result).toEqual({
        apiKey: '',
        baseURL: 'https://docling.amendllc.com',
        syncThresholdMB: 5,
        do_ocr: true,
        force_ocr: false,
        ocr_engine: 'easyocr',
        ocr_lang: 'en',
        output_format: 'md',
      });
    });

    it('should use config values when provided', () => {
      const config = {
        apiKey: 'config-api-key',
        baseURL: 'https://config.docling.com',
        syncThresholdMB: 10,
        do_ocr: false,
        force_ocr: true,
        ocr_engine: 'tesseract',
        ocr_lang: 'fr',
        output_format: 'html',
      } as any;

      const result = loadDoclingOCRConfig(config);

      expect(result).toEqual({
        apiKey: 'config-api-key',
        baseURL: 'https://config.docling.com',
        syncThresholdMB: 10,
        do_ocr: false,
        force_ocr: true,
        ocr_engine: 'tesseract',
        ocr_lang: 'fr',
        output_format: 'html',
      });
    });

    it('should use environment variables when config values are not provided', () => {
      process.env.DOCLING_API_KEY = 'env-api-key';
      process.env.DOCLING_BASE_URL = 'https://env.docling.com';
      process.env.DOCLING_SYNC_THRESHOLD_MB = '15';
      process.env.DOCLING_DO_OCR = 'false';
      process.env.DOCLING_FORCE_OCR = 'true';
      process.env.DOCLING_OCR_ENGINE = 'paddleocr';
      process.env.DOCLING_OCR_LANG = 'es';
      process.env.DOCLING_OUTPUT_FORMAT = 'json';

      const result = loadDoclingOCRConfig(undefined);

      expect(result).toEqual({
        apiKey: 'env-api-key',
        baseURL: 'https://env.docling.com',
        syncThresholdMB: 15,
        do_ocr: false,
        force_ocr: true,
        ocr_engine: 'paddleocr',
        ocr_lang: 'es',
        output_format: 'json',
      });
    });

    it('should prioritize config values over environment variables', () => {
      process.env.DOCLING_API_KEY = 'env-api-key';
      process.env.DOCLING_BASE_URL = 'https://env.docling.com';
      process.env.DOCLING_SYNC_THRESHOLD_MB = '20';

      const config = {
        apiKey: 'config-api-key',
        baseURL: 'https://config.docling.com',
        syncThresholdMB: 25,
      } as any;

      const result = loadDoclingOCRConfig(config);

      expect(result).toEqual({
        apiKey: 'config-api-key',
        baseURL: 'https://config.docling.com',
        syncThresholdMB: 25,
        do_ocr: true,
        force_ocr: false,
        ocr_engine: 'easyocr',
        ocr_lang: 'en',
        output_format: 'md',
      });
    });

    it('should handle partial config with environment fallback', () => {
      process.env.DOCLING_API_KEY = 'env-api-key';
      process.env.DOCLING_OCR_ENGINE = 'env-engine';
      process.env.DOCLING_OUTPUT_FORMAT = 'env-format';

      const config = {
        baseURL: 'https://partial.docling.com',
        syncThresholdMB: 8,
        do_ocr: false,
      } as any;

      const result = loadDoclingOCRConfig(config);

      expect(result).toEqual({
        apiKey: 'env-api-key', // From environment
        baseURL: 'https://partial.docling.com', // From config
        syncThresholdMB: 8, // From config
        do_ocr: false, // From config
        force_ocr: false, // Default
        ocr_engine: 'env-engine', // From environment
        ocr_lang: 'en', // Default
        output_format: 'env-format', // From environment
      });
    });

    it('should handle boolean environment variables correctly', () => {
      // Test various boolean representations
      const testCases = [
        { envValue: 'true', expected: true },
        { envValue: 'false', expected: false },
        { envValue: 'TRUE', expected: false }, // Only 'true' should be true
        { envValue: 'False', expected: false },
        { envValue: '1', expected: false }, // Only 'true' should be true
        { envValue: '0', expected: false },
        { envValue: '', expected: false },
      ];

      testCases.forEach(({ envValue, expected }) => {
        process.env.DOCLING_DO_OCR = envValue;
        process.env.DOCLING_FORCE_OCR = envValue;

        const result = loadDoclingOCRConfig(undefined);

        expect(result!.do_ocr).toBe(expected);
        expect(result!.force_ocr).toBe(expected);
      });
    });

    it('should handle numeric environment variables correctly', () => {
      const testCases = [
        { envValue: '5', expected: 5 },
        { envValue: '10', expected: 10 },
        { envValue: '0', expected: 0 },
        { envValue: 'invalid', expected: NaN },
        { envValue: '', expected: NaN },
      ];

      testCases.forEach(({ envValue, expected }) => {
        process.env.DOCLING_SYNC_THRESHOLD_MB = envValue;

        const result = loadDoclingOCRConfig(undefined);

        if (isNaN(expected)) {
          expect(isNaN(result!.syncThresholdMB)).toBe(true);
        } else {
          expect(result!.syncThresholdMB).toBe(expected);
        }
      });
    });

    it('should handle missing environment variables gracefully', () => {
      // Ensure all environment variables are undefined
      delete process.env.DOCLING_API_KEY;
      delete process.env.DOCLING_BASE_URL;
      delete process.env.DOCLING_SYNC_THRESHOLD_MB;
      delete process.env.DOCLING_DO_OCR;
      delete process.env.DOCLING_FORCE_OCR;
      delete process.env.DOCLING_OCR_ENGINE;
      delete process.env.DOCLING_OCR_LANG;
      delete process.env.DOCLING_OUTPUT_FORMAT;

      const result = loadDoclingOCRConfig(undefined);

      expect(result).toEqual({
        apiKey: '',
        baseURL: 'https://docling.amendllc.com',
        syncThresholdMB: 5,
        do_ocr: true,
        force_ocr: false,
        ocr_engine: 'easyocr',
        ocr_lang: 'en',
        output_format: 'md',
      });
    });

    it('should handle empty string environment variables', () => {
      process.env.DOCLING_API_KEY = '';
      process.env.DOCLING_BASE_URL = '';
      process.env.DOCLING_SYNC_THRESHOLD_MB = '';
      process.env.DOCLING_DO_OCR = '';
      process.env.DOCLING_FORCE_OCR = '';
      process.env.DOCLING_OCR_ENGINE = '';
      process.env.DOCLING_OCR_LANG = '';
      process.env.DOCLING_OUTPUT_FORMAT = '';

      const result = loadDoclingOCRConfig(undefined);

      expect(result).toEqual({
        apiKey: '',
        baseURL: 'https://docling.amendllc.com',
        syncThresholdMB: 5, // Default when NaN
        do_ocr: true, // Default when not 'true'
        force_ocr: false, // Default when not 'true'
        ocr_engine: 'easyocr',
        ocr_lang: 'en',
        output_format: 'md',
      });
    });
  });

  describe('Configuration validation', () => {
    it('should handle various output format values', () => {
      const validFormats = ['md', 'html', 'text', 'json'];
      
      validFormats.forEach(format => {
        const config = {
          output_format: format,
        } as any;

        const result = loadDoclingOCRConfig(config);
        expect(result!.output_format).toBe(format);
      });
    });

    it('should handle various OCR engine values', () => {
      const validEngines = ['easyocr', 'tesseract', 'paddleocr', 'custom'];
      
      validEngines.forEach(engine => {
        const config = {
          ocr_engine: engine,
        } as any;

        const result = loadDoclingOCRConfig(config);
        expect(result!.ocr_engine).toBe(engine);
      });
    });

    it('should handle various language codes', () => {
      const validLanguages = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko'];
      
      validLanguages.forEach(lang => {
        const config = {
          ocr_lang: lang,
        } as any;

        const result = loadDoclingOCRConfig(config);
        expect(result!.ocr_lang).toBe(lang);
      });
    });

    it('should handle various base URL formats', () => {
      const validUrls = [
        'https://docling.example.com',
        'http://localhost:8080',
        'https://api.docling.com/v1',
        'https://docling.amendllc.com',
      ];
      
      validUrls.forEach(url => {
        const config = {
          baseURL: url,
        } as any;

        const result = loadDoclingOCRConfig(config);
        expect(result!.baseURL).toBe(url);
      });
    });

    it('should handle various sync threshold values', () => {
      const validThresholds = [1, 5, 10, 25, 50, 100];
      
      validThresholds.forEach(threshold => {
        const config = {
          syncThresholdMB: threshold,
        } as any;

        const result = loadDoclingOCRConfig(config);
        expect(result!.syncThresholdMB).toBe(threshold);
      });
    });
  });

  describe('Environment variable resolution', () => {
    it('should resolve all environment variables correctly', () => {
      const envVars = {
        DOCLING_API_KEY: 'test-key-123',
        DOCLING_BASE_URL: 'https://test.docling.api.com',
        DOCLING_SYNC_THRESHOLD_MB: '12',
        DOCLING_DO_OCR: 'true',
        DOCLING_FORCE_OCR: 'false',
        DOCLING_OCR_ENGINE: 'custom-engine',
        DOCLING_OCR_LANG: 'multi',
        DOCLING_OUTPUT_FORMAT: 'custom-format',
      };

      Object.entries(envVars).forEach(([key, value]) => {
        process.env[key] = value;
      });

      const result = loadDoclingOCRConfig(undefined);

      expect(result).toEqual({
        apiKey: 'test-key-123',
        baseURL: 'https://test.docling.api.com',
        syncThresholdMB: 12,
        do_ocr: true,
        force_ocr: false,
        ocr_engine: 'custom-engine',
        ocr_lang: 'multi',
        output_format: 'custom-format',
      });
    });

    it('should handle mixed config and environment variables', () => {
      process.env.DOCLING_API_KEY = 'env-key';
      process.env.DOCLING_OCR_ENGINE = 'env-engine';

      const config = {
        baseURL: 'https://config.docling.com',
        do_ocr: false,
      } as any;

      const result = loadDoclingOCRConfig(config);

      expect(result).toEqual({
        apiKey: 'env-key', // From environment
        baseURL: 'https://config.docling.com', // From config
        syncThresholdMB: 5, // Default
        do_ocr: false, // From config
        force_ocr: false, // Default
        ocr_engine: 'env-engine', // From environment
        ocr_lang: 'en', // Default
        output_format: 'md', // Default
      });
    });
  });
});