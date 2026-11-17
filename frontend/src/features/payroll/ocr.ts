/** All OCR code and language assets are served locally; image pixels stay in this browser. */
export async function recognizePayrollImage(
  image: Blob,
  onProgress: (progress: number) => void = () => {},
) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['chi_sim', 'eng'], 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: '/ocr/lang',
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (message) => {
      if (message.status === 'recognizing text')
        onProgress(Math.round(message.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}
