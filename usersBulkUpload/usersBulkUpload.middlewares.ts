import { BadRequest } from '@feathersjs/errors';
import csv from 'csvtojson';
import { Params } from '@feathersjs/feathers';
import {
  Application,
  Hash,
  NextFunction,
  Request,
  Response,
} from '../../declarations';
import { CsvUser } from './usersBulkUpload.class';
import { GendersEnum } from '../../models/user.model';

function formatUserData(users: CsvUser[]) {
  users.forEach((user) => {
    const { gender } = user;
    // if value is male or female
    if (gender?.length >= 4) {
      user.gender = (gender.charAt(0).toUpperCase() +
        gender.slice(1).toLowerCase()) as GendersEnum;
    }
  });
}

async function getValidCSVHeaders(app: Application, params: Params) {
  const validCsvHeaders: Hash<boolean> = {};
  const defConfig = await app
    .service('customRegistrationConfig')
    ._getDefaultConfig(params);
  const { fields } = defConfig;
  fields.forEach((field) => {
    validCsvHeaders[field.fieldName] = true;
  });
  return validCsvHeaders;
}

async function getJSON(
  text: string,
  validCsvHeaders: Hash<boolean>,
): Promise<CsvUser[]> {
  let headers: string[] = [];
  const data: CsvUser[] = await csv({
    trim: true,
    delimiter: ',',
  })
    .fromString(text)
    .on('header', (parsedHeaders) => {
      headers = parsedHeaders;
    });
  headers.forEach((header: string) => {
    if (!(header in validCsvHeaders)) {
      throw new BadRequest('Invalid CSV headers', {
        header,
        validCsvHeaders: Object.keys(validCsvHeaders),
      });
    }
  });
  if (!data?.length) {
    throw new BadRequest('Empty CSV');
  }
  formatUserData(data);
  return data;
}

const csvToJsonMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const csvData =
    (req.feathers?.file as Express.Multer.File)?.buffer.toString() || '';
  let csvUsers: CsvUser[] = [];
  try {
    const validCsvHeaders = await getValidCSVHeaders(
      req.app as Application,
      req.params,
    );
    csvUsers = await getJSON(csvData, validCsvHeaders);
  } catch (error) {
    next(error);
    return;
  }
  req.body = { ...req.body, csvUsers };
  next();
};

export default csvToJsonMiddleware;
