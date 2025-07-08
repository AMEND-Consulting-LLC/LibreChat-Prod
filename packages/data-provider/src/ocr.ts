import type { TCustomConfig } from '../src/config';
import { OCRStrategy } from '../src/config';

export function loadOCRConfig(config: TCustomConfig['ocr']): TCustomConfig['ocr'] {
  const baseURL = config?.baseURL ?? '';
  const apiKey = config?.apiKey ?? '';
  const mistralModel = config?.mistralModel ?? '';
  return {
    apiKey,
    baseURL,
    mistralModel,
    strategy: config?.strategy ?? OCRStrategy.MISTRAL_OCR,
  };
}

export function loadDoclingOCRConfig(config: TCustomConfig['doclingOcr']): TCustomConfig['doclingOcr'] {
  const apiKey = config?.apiKey ?? process.env.DOCLING_API_KEY ?? '';
  const baseURL = config?.baseURL ?? process.env.DOCLING_BASE_URL ?? 'https://docling.amendllc.com';
  const syncThresholdMB = config?.syncThresholdMB ?? Number(process.env.DOCLING_SYNC_THRESHOLD_MB) ?? 5;
  const do_ocr = config?.do_ocr ?? (process.env.DOCLING_DO_OCR === 'true') ?? true;
  const force_ocr = config?.force_ocr ?? (process.env.DOCLING_FORCE_OCR === 'true') ?? false;
  const ocr_engine = config?.ocr_engine ?? process.env.DOCLING_OCR_ENGINE ?? 'easyocr';
  const ocr_lang = config?.ocr_lang ?? process.env.DOCLING_OCR_LANG ?? 'en';
  const output_format = config?.output_format ?? process.env.DOCLING_OUTPUT_FORMAT ?? 'md';
  
  return {
    apiKey,
    baseURL,
    syncThresholdMB,
    do_ocr,
    force_ocr,
    ocr_engine,
    ocr_lang,
    output_format,
  };
}
