import multer from 'multer';
import { LIMITS } from '../config/limits';
import { ApiError, ERROR_CODES } from '../utils/ApiError';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: LIMITS.IMPORT.MAX_FILE_BYTES,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isCsvExt = name.endsWith('.csv') || name.endsWith('.txt');
    const validMimes = [
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
      'text/x-csv',
      'application/x-csv',
      'text/comma-separated-values',
      'application/octet-stream'
    ];
    if (isCsvExt || validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(ApiError.badRequest(ERROR_CODES.IMPORT_FILE_INVALID, 'Only CSV files are allowed'));
    }
  }
});
