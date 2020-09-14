import { ValidateJoiOptions } from '@feathers-plus/validate-joi/index';
import { ObjectSchema, ValidationErrorItem } from '@hapi/joi';
import { HookContext } from '@feathersjs/feathers';
import { Model } from 'mongoose';
import { JoiOptions } from '../validatorSchemas';
import { getUserBulkCreateJoiSchema } from '../users/customConfigValidator';
import { UserDocument } from '../../models/user.model';
import { CsvUser } from './usersBulkUpload.class';
import {
  CsvError,
  getCsvRowError,
  handleCsvErrors,
  ValidationErrorData,
  ValidationParams,
} from '../../hooks/bulkUpload';

interface HashCsvUser extends Pick<CsvUser, 'email' | 'userName'> {
  email: string;
}

type UNIQUE_CSV_EMAIL = Record<HashCsvUser['email'], number>;
type UNIQUE_CSV_USERNAME = Record<HashCsvUser['userName'], number>;

function validateUserPayload(
  params: ValidationParams,
  user: CsvUser,
  index: number,
): ValidationErrorData[] {
  const { schema, options } = params;
  const { error } = schema.validate(user, options);
  if (!error) {
    return [];
  }
  return error.details.map((joiError: ValidationErrorItem) => ({
    value: joiError.context?.value,
    path: joiError.path,
    message: joiError.message,
    line: index + 2, // starting from 2 line, since 1st line is header
  }));
}

function validateUsers(
  users: CsvUser[],
  uniqueEmails: UNIQUE_CSV_EMAIL,
  uniqueUserNames: UNIQUE_CSV_USERNAME,
  params: ValidationParams,
): CsvError {
  const csvError: CsvError = {
    counter: 0,
    errors: [],
  };
  const { numbOfFE } = params;
  let index = 0;
  while (index < users.length && csvError.counter < numbOfFE) {
    const user = users[index];
    const { email, userName } = user;
    csvError.errors[index] = validateUserPayload(params, user, index);
    if (email && email in uniqueEmails && uniqueEmails[email] !== index) {
      csvError.errors[index].push(
        getCsvRowError(
          'email',
          email,
          `The email should be unique in the file`,
          index + 1,
        ),
      );
    }
    if (userName in uniqueUserNames && uniqueUserNames[userName] !== index) {
      csvError.errors[index].push(
        getCsvRowError(
          'userName',
          userName,
          `The userName should be unique in the file`,
          index + 1,
        ),
      );
    }
    if (csvError.errors[index]?.length) {
      csvError.counter += 1;
    }
    index += 1;
  }

  return csvError;
}

async function checkUniqData(
  users: CsvUser[],
  uniqueCsvEmails: UNIQUE_CSV_EMAIL,
  uniqueCsvUserNames: UNIQUE_CSV_USERNAME,
  csvError: CsvError,
  numbOfFE: number,
  userModel: Model<UserDocument>,
) {
  const uniqueEmails: Record<string, boolean> = {};
  const uniqueUserNames: Record<string, boolean> = {};
  const nonUniqData = await userModel
    .find({
      $or: [
        {
          email: {
            $in: Object.keys(uniqueCsvEmails),
          },
        },
        {
          userName: {
            $in: Object.keys(uniqueCsvUserNames),
          },
        },
      ],
    })
    .select(['email', 'userName'])
    .limit(numbOfFE)
    .lean(true)
    .exec();
  nonUniqData.forEach((nonUnique) => {
    const { email, userName } = nonUnique;
    if (email && !(email in uniqueEmails)) {
      uniqueEmails[email] = true;
    }
    if (!(userName in uniqueUserNames)) {
      uniqueUserNames[userName] = true;
    }
  });
  let index = 0;
  while (index < users.length && csvError.counter < numbOfFE) {
    const user = users[index];
    const { email, userName } = user;
    let isErrorFound = false;
    if (email && email in uniqueEmails) {
      csvError.errors[index].push(
        getCsvRowError('email', email, 'The email already exists', index + 1),
      );
      isErrorFound = true;
    }
    if (userName && userName in uniqueUserNames) {
      csvError.errors[index].push(
        getCsvRowError(
          'userName',
          userName,
          'The userName already exists',
          index + 1,
        ),
      );
      isErrorFound = true;
    }
    if (isErrorFound) {
      csvError.counter += 1;
    }
    index += 1;
  }
}

function getUniqueEmailsAndUserNames(
  csvUsers: CsvUser[],
): [UNIQUE_CSV_EMAIL, UNIQUE_CSV_USERNAME] {
  const uniqueCsvEmails: UNIQUE_CSV_EMAIL = {};
  const uniqueCsvUserNames: UNIQUE_CSV_USERNAME = {};
  csvUsers.forEach((user, index) => {
    const { email, userName } = user;
    if (email && !(email in uniqueCsvEmails)) {
      uniqueCsvEmails[email] = index;
    }
    if (!(userName in uniqueCsvUserNames)) {
      uniqueCsvUserNames[userName] = index;
    }
  });
  return [uniqueCsvEmails, uniqueCsvUserNames];
}

export default function runUserBulkUploadValidation({
  schema,
  options = JoiOptions,
}: {
  schema?: ObjectSchema;
  options?: ValidateJoiOptions;
} = {}) {
  return async (context: HookContext): Promise<HookContext> => {
    const { data, app, params } = context;
    const { numberOfFirstErrors } = app.get('config').usersBulkUpload;
    const userModel = app.get('mongooseClient').models.User;
    const numbOfFE = Number(numberOfFirstErrors);
    const defConfig = await app
      .service('customRegistrationConfig')
      ._getDefaultConfig(params);
    const userSchema = getUserBulkCreateJoiSchema(defConfig);
    const csvUserSchema = schema ? userSchema.concat(schema) : userSchema;
    const validationParams: ValidationParams = {
      schema: csvUserSchema,
      numbOfFE,
      options,
    };
    const { csvUsers } = data;
    const [uniqueCsvEmails, uniqueCsvUserNames] = getUniqueEmailsAndUserNames(
      csvUsers,
    );
    const csvError: CsvError = validateUsers(
      csvUsers,
      uniqueCsvEmails,
      uniqueCsvUserNames,
      validationParams,
    );
    await checkUniqData(
      csvUsers,
      uniqueCsvEmails,
      uniqueCsvUserNames,
      csvError,
      numbOfFE,
      userModel,
    );
    handleCsvErrors(csvError, numbOfFE);
    return Promise.resolve(context);
  };
}
