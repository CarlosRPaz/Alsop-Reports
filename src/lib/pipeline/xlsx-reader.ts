import * as XLSX from "xlsx";

/**
 * Reads an Excel workbook from an ArrayBuffer, temporarily suppressing
 * Next.js-disruptive console.error warnings from SheetJS / JSZip (such as
 * "Bad uncompressed size") while parsing files with minor zip header mismatches.
 */
export function safeReadWorkbook(
  fileBuffer: ArrayBuffer,
  options?: XLSX.ParsingOptions,
): XLSX.WorkBook {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const msg = args.join(" ");
    if (msg.includes("Bad uncompressed size")) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  try {
    return XLSX.read(fileBuffer, options);
  } finally {
    console.error = originalConsoleError;
  }
}
